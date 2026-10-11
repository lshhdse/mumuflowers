param([string]$JavaHome, [string]$GradleExecutable)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
if ($JavaHome) { $env:JAVA_HOME = $JavaHome }
if (!$env:JAVA_HOME) { throw '请通过 -JavaHome 指定 JDK 21 目录，或设置 JAVA_HOME。' }
if (!(Test-Path -LiteralPath (Join-Path $env:JAVA_HOME 'bin/jlink.exe'))) { throw '需要完整 JDK 21；当前 Java 目录缺少 jlink.exe。' }
node scripts/create-signing.mjs
if ($LASTEXITCODE -ne 0) { throw '签名生成失败' }
$credentialsPath = Join-Path $projectRoot '.tools/signing/credentials.json'
$credentials = Get-Content -LiteralPath $credentialsPath -Raw | ConvertFrom-Json
$env:MUMU_KEYSTORE_FILE = Join-Path $projectRoot '.tools/signing/mumu-release.jks'
$env:MUMU_KEYSTORE_PASSWORD = $credentials.storePassword
$env:MUMU_KEY_ALIAS = $credentials.alias
$env:MUMU_KEY_PASSWORD = $credentials.keyPassword
try {
  npm run android:sync
  if ($LASTEXITCODE -ne 0) { throw '界面编译失败' }
  Set-Location -LiteralPath (Join-Path $projectRoot 'android')
  if ($GradleExecutable) { & $GradleExecutable assembleRelease --no-daemon } else { & '.\gradlew.bat' assembleRelease --no-daemon }
  if ($LASTEXITCODE -ne 0) { throw '安卓构建失败' }
  Set-Location -LiteralPath $projectRoot
  New-Item -ItemType Directory -Path 'artifacts' -Force | Out-Null
  $appVersion = (Get-Content -LiteralPath 'src/version.json' -Raw | ConvertFrom-Json).version
  $apkPath = "artifacts/MuMu-Flowers-$appVersion.apk"
  Copy-Item -LiteralPath 'android/app/build/outputs/apk/release/app-release.apk' -Destination $apkPath
  Write-Output "安装包：$apkPath"
} finally {
  Remove-Item Env:MUMU_KEYSTORE_PASSWORD,Env:MUMU_KEY_PASSWORD -ErrorAction SilentlyContinue
  Set-Location -LiteralPath $projectRoot
}
