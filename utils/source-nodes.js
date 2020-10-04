const {fetchGoogleDocsDocuments} = require("./google-docs")

/**
 * @param { import("gatsby").SourceNodesArgs } args
 * @param { import("..").Options } pluginOptions
 */
exports.sourceNodes = async (
  {actions: {createNode}, createContentDigest, reporter},
  pluginOptions
) => {
  try {
    const googleDocsDocuments = await fetchGoogleDocsDocuments(pluginOptions)

    for (let googleDoc of googleDocsDocuments) {
      createNode({
        ...googleDoc,
        internal: {
          type: "GoogleDocs",
          mediaType: "text/markdown",
          content: googleDoc.markdown,
          contentDigest: createContentDigest(googleDoc.markdown),
        },
        dir: process.cwd(), // To make gatsby-remark-images works
      })
    }

    reporter.success(
      `source-google-docs: ${googleDocsDocuments.length} documents fetched`
    )

    return
  } catch (e) {
    if (pluginOptions.debug) {
      reporter.panic(`source-google-docs: `, e)
    } else {
      reporter.panic(`source-google-docs: ${e.message}`)
    }
  }
}
