const {createRemoteFileNode} = require("gatsby-source-filesystem")

const GOOGLE_IMAGE_REGEX = /https:\/\/[a-z0-9]*.googleusercontent\.com\/[a-zA-Z0-9_-]*/

/** @param { import("gatsby").CreateNodeArgs<import('..').Metadata> } args */
exports.onCreateNodeGoogleDocs = async ({
  node,
  actions: {createNode, createNodeField},
  store,
  cache,
  createNodeId,
  createContentDigest,
  reporter,
}) => {
  createNodeField({
    node,
    name: `slug`,
    value: node.path,
  })

  if (node.cover && GOOGLE_IMAGE_REGEX.test(node.cover.image)) {
    let fileNode
    try {
      const url = node.cover.image

      fileNode = await createRemoteFileNode({
        url,
        parentNodeId: node.id,
        createNode,
        createNodeId,
        cache,
        store,
        name: "google-docs-image-" + createNodeId(url),
        ext: ".png",
        reporter,
      })
    } catch (e) {
      reporter.warn(`source-google-docs: ${e}`)
    }

    if (fileNode) {
      delete node.cover.image
      node.cover.image___NODE = fileNode.id

      // fileNode.id is usefull to link MarkdownRemark cover nodes
      await cache.set(fileNode.relativePath, fileNode.id)
    }
  }

  const googleUrls = node.markdown.match(
    new RegExp(GOOGLE_IMAGE_REGEX.source, "g")
  )
  if (Array.isArray(googleUrls)) {
    const filesNodes = await Promise.all(
      googleUrls.map(async (url) => {
        let fileNode
        try {
          fileNode = await createRemoteFileNode({
            url,
            parentNodeId: node.id,
            createNode,
            createNodeId,
            cache,
            store,
            name: "google-docs-image-" + createNodeId(url),
            ext: ".png",
            reporter,
          })
        } catch (e) {
          reporter.warn(`source-google-docs: ${e}`)
        }

        return fileNode
      })
    )

    filesNodes
      .filter((fileNode) => fileNode)
      .forEach((fileNode) => {
        node.markdown = node.markdown.replace(
          new RegExp(fileNode.url, "g"),
          fileNode.relativePath
        )
      })

    node.images___NODE = filesNodes
      .filter((fileNode) => fileNode)
      .map((fileNode) => fileNode.id)
  }

  node.internal.content = node.markdown
  node.internal.contentDigest = createContentDigest(node.markdown)
}
