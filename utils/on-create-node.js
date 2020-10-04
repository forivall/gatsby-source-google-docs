const {onCreateNodeGoogleDocs} = require("./on-create-node-google-docs")
const {onCreateNodeMarkdownRemark} = require("./on-create-node-markdown-remark")

/** @param { import("gatsby").CreateNodeArgs<any> } args */
exports.onCreateNode = async (args) => {
  const {node} = args
  if (node.internal.type === "GoogleDocs") {
    await onCreateNodeGoogleDocs(args)
  }

  if (node.internal.type === "MarkdownRemark") {
    await onCreateNodeMarkdownRemark(args)
  }
}
