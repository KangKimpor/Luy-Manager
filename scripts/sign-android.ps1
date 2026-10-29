param([string]$Output = 'android/Luy-Manager-Native-0.2.0-preview.apk')
$ErrorActionPreference = 'Stop'
$taskSigningDir = Join-Path $env:USERPROFILE '.luy-manager'
$taskKey = Join-Path $taskSigningDir 'preview-v1.keystore'
$taskCredential = Join-Path $taskSigningDir 'preview-signing.xml'
$taskSdk = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { Join-Path $env:LOCALAPPDATA 'Android/Sdk' }
$taskTools = Join-Path $taskSdk 'build-tools/36.0.0'
if (!$env:JAVA_HOME) { throw 'Set JAVA_HOME to your JDK 17 directory.' }
New-Item -ItemType Directory -Force $taskSigningDir | Out-Null
try {
    if (!(Test-Path -LiteralPath $taskKey)) {
        if (Test-Path -LiteralPath $taskCredential) { throw 'Signing credential exists without its key. Recover the key before continuing.' }
        $taskBytes = New-Object byte[] 32
        [System.Security.Cryptography.RandomNumberGenerator]::Fill($taskBytes)
        $env:LUY_SIGNING_PASSWORD = [Convert]::ToBase64String($taskBytes)
        $taskSecret = ConvertTo-SecureString $env:LUY_SIGNING_PASSWORD -AsPlainText -Force
        [pscredential]::new('luy-preview', $taskSecret) | Export-Clixml -LiteralPath $taskCredential
        & "$env:JAVA_HOME/bin/keytool.exe" -genkeypair -keystore $taskKey -alias android -keyalg RSA -keysize 3072 -validity 10000 -dname 'CN=Luy Manager Preview' -storepass:env LUY_SIGNING_PASSWORD -keypass:env LUY_SIGNING_PASSWORD
        if ($LASTEXITCODE) { throw 'Key generation failed.' }
    } else {
        $env:LUY_SIGNING_PASSWORD = (Import-Clixml -LiteralPath $taskCredential).GetNetworkCredential().Password
    }
    $taskUnsigned = 'android/native/app/build/outputs/apk/release/app-release-unsigned.apk'
    $taskAligned = 'android/native/app/build/outputs/apk/release/app-aligned.apk'
    & "$taskTools/zipalign.exe" -f -p 4 $taskUnsigned $taskAligned
    if ($LASTEXITCODE) { throw 'APK alignment failed.' }
    & "$taskTools/apksigner.bat" sign --ks $taskKey --ks-key-alias android --ks-pass env:LUY_SIGNING_PASSWORD --key-pass env:LUY_SIGNING_PASSWORD --v4-signing-enabled false --out $Output $taskAligned
    if ($LASTEXITCODE) { throw 'APK signing failed.' }
    & "$taskTools/apksigner.bat" verify --verbose $Output
    if ($LASTEXITCODE) { throw 'APK signature verification failed.' }
    & "$taskTools/zipalign.exe" -c -p 4 $Output
    if ($LASTEXITCODE) { throw 'APK alignment verification failed.' }
    Get-FileHash -Algorithm SHA256 -LiteralPath $Output
} finally {
    Remove-Item Env:LUY_SIGNING_PASSWORD -ErrorAction SilentlyContinue
}
