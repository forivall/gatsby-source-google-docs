const {google} = require("googleapis")
const GoogleOAuth2 = require("google-oauth2-env-vars")

const {ENV_TOKEN_VAR} = require("./constants")

const {
  convertGoogleDocumentToJson,
  convertJsonToMarkdown,
} = require("./converters")

const {fetchGoogleDriveDocuments} = require("./google-drive")

const demoteHeadings = ({content, headings}) => {
  const newContent = {...content}

  headings.forEach((title) => {
    const titleLevel = Number(title.tag.substring(1))
    const demotedTag = "h" + (titleLevel + 1)
    newContent[title.index] = {[demotedTag]: title.text}
  })

  return newContent
}

const replaceCrossDocumentsLinksbyRelativePaths = ({
  markdown,
  relativePaths,
}) => {
  let newMarkdown = markdown.slice()

  const googleDocsUrlsMatches = markdown.matchAll(
    /https:\/\/docs.google.com\/document\/(?:u\/\d+\/)?d\/([a-zA-Z0-9_-]+)/g
  )

  for (const [url, id] of googleDocsUrlsMatches) {
    if (relativePaths[id]) {
      newMarkdown = newMarkdown.replace(new RegExp(url, "g"), relativePaths[id])
    }
  }

  return newMarkdown
}

/**
 * @param {object} options
 * @param {string} options.id
 */
async function fetchGoogleDocsDocument({id}) {
  const googleOAuth2 = new GoogleOAuth2({
    token: ENV_TOKEN_VAR,
  })
  const auth = await googleOAuth2.getAuth()

  const res = await google.docs({version: "v1", auth}).documents.get({
    documentId: id,
  })

  if (!res.data) {
    throw new Error("Empty Data")
  }

  return res.data
}

/** @param {import('..').Options} pluginOptions */
async function fetchGoogleDocsDocuments(pluginOptions) {
  const googleDriveDocument = await fetchGoogleDriveDocuments(pluginOptions)
  const relativePaths = {}

  const googleDocsDocuments = await Promise.all(
    googleDriveDocument.map(async (metadata) => {
      const document = await fetchGoogleDocsDocument({
        id: metadata.id,
      })

      relativePaths[metadata.id] = metadata.path

      return {document, metadata}
    })
  )

  return googleDocsDocuments.map(({document, metadata}) => {
    let {content, cover, headings} = convertGoogleDocumentToJson(document)

    let markdown = convertJsonToMarkdown({
      metadata: {...metadata, cover},
      content,
    })

    // Readers will have no access to real documents
    // Replace all cross-documents links by relative paths
    markdown = replaceCrossDocumentsLinksbyRelativePaths({
      markdown,
      relativePaths,
    })

    // h1 -> h2, h2 -> h3, ...
    if (pluginOptions.demoteHeadings === true) {
      content = demoteHeadings({content, headings})
    }

    return {
      ...metadata,
      content,
      cover,
      markdown,
    }
  })
}

module.exports = {
  fetchGoogleDocsDocuments,
}
