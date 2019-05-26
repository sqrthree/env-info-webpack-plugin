const _ = require('lodash')
const DefinePlugin = require('webpack/lib/DefinePlugin')
const WebpackError = require('webpack/lib/WebpackError')
const pkgUp = require('pkg-up')
const { ConcatSource } = require('webpack-sources')

const pluginName = 'EnvInfoPlugin'

const globalThisName = {
  web: 'window',
  node: 'global',
}

/**
 * Resolve version from closest package.json file.
 * @param {String} cwd Directory to start from.
 */
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
   * @param {Object} options Options from user.
   * @param {String} options.name Variable name for env info.
   * @param {Boolean} options.output Output env info to global variable.
   * @param {Boolean|String} options.persistent Persistent storage to local file.
   * @return {void}
   */
  constructor(options) {
    this.options = _.defaults(options, {
      name: 'BUILD_INFO',
      output: false,
      persistent: false,
    })
  }

  /**
   * Apply the plugin.
   * @param {Compiler} compiler Webpack compiler.
   * @returns {void}
   */
  apply(compiler) {
    let envInfo = null

    compiler.hooks.beforeCompile.tapPromise(pluginName, async () => {
      let version = ''

      try {
        ;[version] = await Promise.all([
          getVersion(compiler.context).catch(err => reportError(err, compiler)),
        ])
      } catch (err) {
        reportError(err, compiler)
      }

      envInfo = {
        version,
        time: new Date().toISOString(),
      }

      const env = {
        [this.options.name]: JSON.stringify(envInfo),
      }

      new DefinePlugin(env).apply(compiler)
    })

    if (this.options.persistent) {
      compiler.hooks.emit.tapAsync(pluginName, (compilation, callback) => {
        const filename = _.isString(this.options.persistent)
          ? this.options.persistent
          : 'env-info.json'
        const content = JSON.stringify(envInfo, null, 2)

        // eslint-disable-next-line
        compilation.assets[filename] = {
          source() {
            return content
          },
          size() {
            return content.length
          },
        }

        callback()
      })
    }

    const { target } = compiler.options

    if (this.options.output) {
      if (!globalThisName[target]) {
        reportWarning(
          new Error(
            'Sorry, output option does not support the current target. But PRs are welcome.'
          ),
          compiler
        )
        return
      }

      compiler.hooks.compilation.tap(pluginName, compilation => {
        compilation.hooks.optimizeChunkAssets.tap(pluginName, chunks => {
          for (const chunk of chunks) {
            if (!chunk.canBeInitial()) {
              continue
            }

            for (const file of chunk.files) {
              const content = `;${
                globalThisName[target]
              }.BUILD_INFO = ${JSON.stringify(envInfo)};`

              compilation.assets[file] = new ConcatSource(
                content,
                '\n',
                compilation.assets[file]
              )
            }
          }
        })
      })
    }
  }
}

module.exports = EnvInfoWebpackPlugin
