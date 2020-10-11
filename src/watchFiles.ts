import * as typescript from './typescript'
import { watchFile, unwatchFile, Stats } from 'fs'
import globby from 'globby'
const path = require('path')
const shell = require('shelljs')

const determineNewWatchFiles = (watchedFiles, newWatchFiles, cb) => {
  watchedFiles.forEach((fileName) => {
    if (newWatchFiles.indexOf(fileName) < 0) {
      unwatchFile(fileName, cb)
    }
  })
  newWatchFiles.forEach((fileName) => {
    if (watchedFiles.indexOf(fileName) < 0) {
      watchFile(fileName, { persistent: true, interval: 250 }, cb)
    }
  })
}

export async function watchFiles(
  rootFileNames: string[],
  originalServicePath: string,
  cb: () => void,
  generateGraphqlTypes: () => void,
  graphqlFilePaths: string[]
) {
  const tsConfig = typescript.getTypescriptConfig(originalServicePath)
  let watchedFiles = typescript.getSourceFiles(rootFileNames, tsConfig)
  let watchedGraphqlFiles = await globby(graphqlFilePaths)

  const watchCallback = (curr: Stats, prev: Stats) => {
    // Check timestamp
    if (+curr.mtime <= +prev.mtime) {
      return
    }
    cb()
    // use can reference not watched yet file or remove reference to already watched
    const newWatchFiles = typescript.getSourceFiles(rootFileNames, tsConfig)
    determineNewWatchFiles(watchedFiles, newWatchFiles, generateGraphqlTypes)
    watchedFiles = newWatchFiles
  }

  const watchGraphqlCallback = (changedFilePath) => async (
    curr: Stats,
    prev: Stats
  ) => {
    // Check timestamp
    if (+curr.mtime <= +prev.mtime) {
      return
    }
    const copyChangedGraphqlFileToBuild = () => {
      const basePath = path.basename(path.resolve(process.cwd()))
      const basePathIndex = changedFilePath.indexOf(basePath) + basePath.length

      const buildPath =
        changedFilePath.slice(0, basePathIndex) +
        '/.build' +
        changedFilePath.slice(basePathIndex)

      shell.cp(changedFilePath, buildPath)
    }

    generateGraphqlTypes()
    copyChangedGraphqlFileToBuild()
    // use can reference not watched yet file or remove reference to already watched
    const newWatchGqlFiles = await globby(graphqlFilePaths)
    determineNewWatchFiles(
      watchedGraphqlFiles,
      newWatchGqlFiles,
      generateGraphqlTypes
    )
    watchedGraphqlFiles = newWatchGqlFiles
  }

  watchedFiles.forEach((fileName) => {
    watchFile(fileName, { persistent: true, interval: 250 }, watchCallback)
  })

  if (watchedGraphqlFiles.length) {
    watchedGraphqlFiles.forEach((fileName) => {
      watchFile(
        fileName,
        { persistent: true, interval: 250 },
        watchGraphqlCallback(fileName)
      )
    })
  }
}
