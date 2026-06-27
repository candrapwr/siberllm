import type { ForgeConfig } from '@electron-forge/shared-types'
import { MakerSquirrel } from '@electron-forge/maker-squirrel'
import { MakerZIP } from '@electron-forge/maker-zip'
import { MakerDMG } from '@electron-forge/maker-dmg'
import { MakerDeb } from '@electron-forge/maker-deb'
import { MakerRpm } from '@electron-forge/maker-rpm'
import { PublisherGithub } from '@electron-forge/publisher-github'
import { resolve } from 'node:path'
import { config as loadEnv } from 'dotenv'

// Load GITHUB_TOKEN from .env (gitignored) so you don't have to export it
// in every new terminal session. Harmless if .env doesn't exist.
loadEnv()

const iconPath = resolve(__dirname, 'build', 'icon')

const config: ForgeConfig = {
  packagerConfig: {
    name: 'SiberLLM',
    executableName: 'siberllm',
    asar: true,
    // macOS app identity (shows in Get Info, notifications, etc.)
    appBundleId: 'com.datasiberlab.siberllm',
    appCategoryType: 'public.app-category.developer-tools',
    icon: iconPath, // resolves to build/icon — packager appends .icns/.ico itself
    // Only bundle what the app needs to run. Keep dist/ (the built app),
    // exclude everything else (sources, scripts, tests, etc).
    ignore: [
      /^\/src$/,
      /^\/scripts$/,
      /^\/out$/,
      /^\/\.git$/,
      /^\/tsconfig(\..*)?\.json$/,
      /^\/tailwind\.config\.ts$/,
      /^\/postcss\.config\.js$/,
      /^\/electron\.vite\.config\.ts$/,
      /^\/forge\.config\.ts$/,
      /^\/README\.md$/,
      /^\/DEVELOPMENT\.md$/,
      /\.md$/,
      /^\/build\/icon\.svg$/,
      /^\/build\/icon\.iconset$/,
      /^\/build\/icon\.png$/
    ]
  },
  makers: [
    // macOS: .dmg installer (the primary macOS deliverable)
    new MakerDMG({
      name: 'SiberLLM',
      format: 'ULFO', // best compression; falls back to UDZO if unsupported
      overwrite: true
    }),
    // Windows: .exe installer (Squirrel)
    new MakerSquirrel({ name: 'siberllm' }),
    // Portable zip (any platform, used as fallback)
    new MakerZIP({}, ['darwin', 'linux']),
    // Linux packages
    new MakerDeb({
      options: { name: 'siberllm', productName: 'SiberLLM' }
    }),
    new MakerRpm({
      options: { name: 'siberllm', productName: 'SiberLLM' }
    })
  ],
  publishers: [
    // Publish artifacts to a GitHub release tagged with the version.
    // Repo + token come from env (see scripts/release.sh).
    new PublisherGithub({
      repository: {
        owner: 'candrapwr',
        name: 'siberllm'
      },
      draft: true, // create as draft so you can review before going public
      prerelease: false,
      generateReleaseNotes: true // auto-generate changelog from commits
    })
  ]
}

export default config
