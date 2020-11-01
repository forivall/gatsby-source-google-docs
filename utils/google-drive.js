const {google} = require("googleapis")
const _kebabCase = require("lodash/kebabCase")
const _chunk = require("lodash/chunk")
const _flatten = require("lodash/flatten")
const GoogleOAuth2 = require("google-oauth2-env-vars")
const yamljs = require("yamljs")
const wyt = require("@forivall/wyt")

const {ENV_TOKEN_VAR} = require("./constants")

const MIME_TYPE_DOCUMENT = "application/vnd.google-apps.document"
const MIME_TYPE_FOLDER = "application/vnd.google-apps.folder"
const MIME_TYPE_IMAGE_PREFIX = "image/"

/**
 * @param {import('googleapis').drive_v3.Schema$File} file
 * @returns {file is import("..").DocumentFile}
 */
const isDocument = (file) => file.mimeType === MIME_TYPE_DOCUMENT

/**
 * @template T
 * @param {T[]} arr
 * @param {number} count
 * @returns {T[][]}
 */
function evenlyChunk(arr, count) {
  const chunks = Math.ceil(arr.length / count)
  if (chunks <= 1) {
    return [arr]
  }
  return _chunk(arr, Math.ceil(arr.length / chunks))
}

/**
 * @param {object} options
 * @param {import('..').Metadata} options.metadata
 * @param {Record<string, unknown>=} options.fieldsDefault
 * @param {Record<string, string>=} options.fieldsMapper
 */
const updateMetadata = ({metadata, fieldsDefault = {}, fieldsMapper = {}}) => {
  const breadcrumb = metadata.path
    .split("/")
    // Remove empty strings
    .filter((element) => element)

  if (metadata.name === "index" && breadcrumb.length > 0) {
    // Remove "index"
    breadcrumb.pop()
    // Remove folder name and use it as name
    metadata.name = breadcrumb.pop()
    // Path need to be updated
    metadata.path =
      breadcrumb.length > 0
        ? `/${breadcrumb.join("/")}/${metadata.name}`
        : `/${metadata.name}`
  }

  // Default values
  Object.keys(fieldsDefault).forEach((key) => {
    Object.assign(metadata, {
      [key]: fieldsDefault[key],
    })
  })

  // Fields transformation
  Object.keys(fieldsMapper).forEach((oldKey) => {
    const newKey = fieldsMapper[oldKey]

    Object.assign(metadata, {
      [newKey]: metadata[oldKey],
    })

    delete metadata[oldKey]
  })

  // Transform description into metadata if description is YAML
  if (metadata.description) {
    try {
      // Try to convert description from YAML
      const descriptionObject = yamljs.parse(metadata.description)
      if (typeof descriptionObject !== "string") {
        metadata = {...metadata, ...descriptionObject}
      }
    } catch (e) {
      // Description field is not valid YAML
      // Do not throw an error
    }
  }

  return {...metadata, breadcrumb}
}

async function getGdrive() {
  const googleOAuth2 = new GoogleOAuth2({
    token: ENV_TOKEN_VAR,
  })
  const auth = await googleOAuth2.getAuth()

  return google.drive({version: "v3", auth})
}

/**
 * @typedef DocumentFetchParent
 * @property {string | null} id
 * @property {string[]} breadcrumb
 * @property {string} path
 * @property {import('googleapis').drive_v3.Schema$File[]=} images
 */

/**
 * @typedef FetchDocumentsOptions
 * @property {import('googleapis').drive_v3.Drive} drive
 * @property {DocumentFetchParent[]} parents
 */

/**
 * @typedef {import('..').DocumentFile &
 *   Pick<import("..").Metadata, 'path' | 'parentPath' | 'images'>
 * } FetchedDocument
 */

// 10 per 2 seconds.
const rateLimit = wyt(10, 2000)
const BATCH_SIZE = 25
/**
 * @param {import('..').Options & FetchDocumentsOptions} options
 * @returns {Promise<FetchedDocument[]>}
 */
async function fetchDocuments({drive, parents, ...options}) {
  if (parents.length > BATCH_SIZE) {
    return _flatten(
      await Promise.all(
        evenlyChunk(parents, BATCH_SIZE).map((parents) =>
          fetchDocuments({
            drive,
            parents,
            ...options,
          })
        )
      )
    )
  }
  const {
    debug,
    fields,
    ignoredFolders = [],
    ignoreFolderTest = () => false,
    listImages,
  } = options

  const waited = await rateLimit()
  if (debug) {
    const waitedText =
      waited > 1000 ? ` (waited ${(waited / 1000).toFixed(1)}s)` : ""
    // eslint-disable-next-line no-console
    console.info(
      `source-google-docs: Fetching children of ${parents.length} folders, depth ${parents[0].breadcrumb.length}` +
        waitedText
    )
  }

  const parentQuery =
    parents.length === 1 && parents[0].id === null
      ? false
      : parents.map((p) => `'${p.id}' in parents`).join(" or ")

  const mimetypeFilters = [MIME_TYPE_FOLDER, MIME_TYPE_DOCUMENT].map(
    (m) => `mimeType='${m}'`
  )
  if (listImages) {
    mimetypeFilters.push(`mimeType contains '${MIME_TYPE_IMAGE_PREFIX}'`)
  }
  const mimetypeQuery = mimetypeFilters.join(" or ")

  /** @type {import('googleapis').drive_v3.Params$Resource$Files$List} */
  const query = {
    includeTeamDriveItems: true,
    supportsAllDrives: true,
    pageSize: 1000,
    q: `${
      parentQuery ? `(${parentQuery}) and ` : ""
    }(${mimetypeQuery}) and trashed = false`,
    fields: `nextPageToken,files(id, mimeType, name, description, createdTime, modifiedTime, starred, parents${
      fields ? `, ${fields.join(", ")}` : ""
    })`,
  }
  if (debug) {
    console.info("source-google-docs: ", mimetypeQuery)
  }
  const res = await drive.files.list(query)
  let documents = res.data.files.filter(isDocument)

  /** @param {typeof res.data.files} files */
  const addImagesToParents = (files) => {
    let n = 0
    for (const file of files) {
      if (file.mimeType.startsWith(MIME_TYPE_IMAGE_PREFIX)) {
        const parentIds = file.parents && new Set(file.parents)
        const parent = parentIds && parents.find((p) => parentIds.has(p.id))
        if (parent) {
          ;(parent.images || (parent.images = [])).push(file)
        } else {
          console.warn("No parent found for image!", file.id)
        }
      }
    }
    if (n && debug) {
      console.info(`source-google-docs: Added ${n} images`)
    }
  }
  addImagesToParents(res.data.files)

  /** @param {import("..").DocumentFile} file */
  const finalizeDocument = (file) => {
    const parentIds = file.parents && new Set(file.parents)
    const parent = parentIds && parents.find((p) => parentIds.has(p.id))
    const parentPath = (parent && parent.path) || ""
    return {
      ...file,
      parentImages: parent.images,
      path: `${parentPath}/${_kebabCase(file.name)}`,
      parentPath,
      rawParentPath: parent.breadcrumb.join("/"),
    }
  }

  /** @param {typeof res.data.files} files */
  const collectParents = (files) => {
    const rawFolders = files.filter(
      /** @returns {file is import("..").RawFolder} */
      (file) => file.mimeType === MIME_TYPE_FOLDER
    )

    const nonIgnoredRawFolders = rawFolders.filter(
      (folder) =>
        !(
          folder.name.toLowerCase() === "drafts" ||
          ignoreFolderTest(folder) ||
          ignoredFolders.includes(folder.name) ||
          ignoredFolders.includes(folder.id)
        )
    )
    return nonIgnoredRawFolders.map((folder) => {
      const parentIds = folder.parents && new Set(folder.parents)
      const parent = parentIds && parents.find((p) => parentIds.has(p.id))
      const parentPath = (parent && parent.path) || ""
      return {
        id: folder.id,
        breadcrumb: [...((parent && parent.breadcrumb) || []), folder.name],
        path: `${parentPath}/${_kebabCase(folder.name)}`,
      }
    })
  }
  let nextParents = collectParents(res.data.files)

  if (!res.data.nextPageToken) {
    if (nextParents.length === 0) {
      return documents.map(finalizeDocument)
    }
    const documentsInFolders = await fetchDocuments({
      drive,
      parents: nextParents,
      ...options,
    })
    return [...documents.map(finalizeDocument), ...documentsInFolders]
  }

  /** @type {FetchedDocument[]} */
  let documentsInFolders = []

  const fetchOneParentsBatch = async () => {
    // process one batch of children while continuing on with pages
    const parentBatch = nextParents.slice(0, BATCH_SIZE)
    nextParents = nextParents.slice(BATCH_SIZE)
    const results = await fetchDocuments({
      drive,
      parents: parentBatch,
      ...options,
    })
    documentsInFolders = [...documentsInFolders, ...results]
  }

  /**
   * @param {string} nextPageToken
   * @returns {Promise<FetchedDocument[]>}
   */
  const fetchNextPage = async (nextPageToken) => {
    await rateLimit()
    console.info(`source-google-docs: nextPage`)
    const nextRes = await drive.files.list({
      ...query,
      pageToken: nextPageToken,
    })
    documents = [...documents, ...nextRes.data.files.filter(isDocument)]
    addImagesToParents(nextRes.data.files)
    nextParents = [...nextParents, ...collectParents(nextRes.data.files)]

    if (!nextRes.data.nextPageToken) {
      if (nextParents.length === 0) {
        return documents.map(finalizeDocument)
      }
      const finalDocumentsInFolders = await fetchDocuments({
        drive,
        parents: nextParents,
        ...options,
      })
      return [
        ...documents.map(finalizeDocument),
        ...documentsInFolders,
        ...finalDocumentsInFolders,
      ]
    }

    const nextPagePromise = fetchNextPage(nextRes.data.nextPageToken)
    if (nextParents.length < BATCH_SIZE) {
      return nextPagePromise
    }
    return (await Promise.all([nextPagePromise, fetchOneParentsBatch()]))[0]
  }
  return fetchNextPage(res.data.nextPageToken)
}

/** @param {import('..').Options} pluginOptions */
async function fetchDocumentsMetadata({folders = [null], ...options}) {
  const drive = await getGdrive()

  const googleDriveDocuments = (
    await fetchDocuments({
      drive,
      parents: folders.map((id) => ({id, breadcrumb: [], path: ""})),
      ...options,
    })
  ).map((metadata) => {
    let updatedMetadata = updateMetadata({metadata, ...options})

    if (
      options.updateMetadata &&
      typeof options.updateMetadata === "function"
    ) {
      updatedMetadata = options.updateMetadata(updatedMetadata)
    }
    return updatedMetadata
  })

  return googleDriveDocuments
}

module.exports = {
  fetchDocumentsMetadata,
}
