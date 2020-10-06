const fs = require("fs")
const path = require("path")
const _kebabCase = require("lodash/kebabCase")

exports.writeDocumentToTests = (googleDocument) => {
  fs.writeFileSync(
    path.join(
      __dirname,
      "..",
      "__tests__",
      "documents",
      `${_kebabCase(googleDocument.document.title)}.json`
    ),
    JSON.stringify(googleDocument.document, null, 2)
  )
}

if (require.main === module) {
  ;(async function main() {
    const GoogleOAuth2 = require("google-oauth2-env-vars")
    const googleOAuth2 = new GoogleOAuth2({
      token: require("./constants").ENV_TOKEN_VAR,
    })
    const auth = await googleOAuth2.getAuth()
    const api = require("googleapis").google.docs({version: "v1", auth})
    for (const id of process.argv.slice(2)) {
      exports.writeDocumentToTests({
        document: (await api.documents.get({documentId: id})).data,
      })
    }
  })()
}
