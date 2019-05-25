const _ = require('lodash')
const DefinePlugin = require('webpack/lib/DefinePlugin')
const WebpackError = require('webpack/lib/WebpackError')
const pkgUp = require('pkg-up')

const pluginName = 'EnvInfoPlugin'

const getVersion = cwd => {
  return pkgUp(cwd).then(filepath => {
    if (!filepath) {
      throw new Error(
        `Cannot resolve [version] from package.json: No such file.`
      )
    }

    try {
      // eslint-disable-next-line
      const pkg = require(filepath)

      return pkg.version
    } catch (err) {
      throw new Error(
        `Cannot resolve [version] from ${filepath}: ${err.message}`
      )
    }
  })
}

const report = (type, err, compiler) => {
  compiler.hooks.compilation.tap(pluginName, compilation => {
    const error = new WebpackError(`${pluginName} - ${err.message}`)

    error.name = 'EnvResolveError'
    compilation[`${type}s`].push(error)
  })
}

const reportError = (err, compiler) => {
  report('error', err, compiler)
}

const reportWarning = (err, compiler) => {
  report('warning', err, compiler)
}

class EnvInfoWebpackPlugin {
  /**
   * Resolve user options.
   * @param {Object} options options from user.
   * @param {String} options.name variable name for env info.
   * @return {void}
   */
  constructor(options) {
    this.options = _.defaults(options, {
      name: 'BUILD_INFO',
    })
  }

  /**
   * Apply the plugin.
   * @param {Compiler} compiler Webpack compiler.
   * @returns {void}
   */
  apply(compiler) {
    compiler.hooks.beforeCompile.tapPromise(pluginName, async () => {
      let version = ''

      try {
        ;[version] = await Promise.all([
          getVersion(compiler.context).catch(err => reportError(err, compiler)),
        ])
      } catch (err) {
        reportError(err, compiler)
      }

      const envInfo = {
        version,
        time: new Date().toISOString(),
      }

      const env = {
        [this.options.name]: JSON.stringify(envInfo),
      }

      new DefinePlugin(env).apply(compiler)
    })
  }
}

module.exports = EnvInfoWebpackPlugin