$ErrorActionPreference = 'Stop'

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$buildRoot = Join-Path $projectRoot 'build'
$distRoot = Join-Path $projectRoot 'dist'
$packageName = 'snow-motion-v1.0.0'
$stageRoot = Join-Path $buildRoot 'repository-package'
$packageRoot = Join-Path $stageRoot $packageName
$archivePath = Join-Path $distRoot "$packageName.zip"

function Assert-PathUnderRoot {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Root
    )

    $fullPath = [System.IO.Path]::GetFullPath($Path)
    $fullRoot = [System.IO.Path]::GetFullPath($Root).TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
    if (-not $fullPath.StartsWith($fullRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to operate outside ${fullRoot}: $fullPath"
    }
}

function Copy-RequiredFile {
    param(
        [Parameter(Mandatory = $true)][string]$RelativePath
    )

    $source = Join-Path $projectRoot $RelativePath
    if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
        throw "Required release file is missing: $RelativePath"
    }

    $destination = Join-Path $packageRoot $RelativePath
    $destinationDirectory = Split-Path -Parent $destination
    New-Item -ItemType Directory -Path $destinationDirectory -Force | Out-Null
    Copy-Item -LiteralPath $source -Destination $destination -Force
}

function Copy-RequiredDirectory {
    param(
        [Parameter(Mandatory = $true)][string]$RelativePath
    )

    $source = Join-Path $projectRoot $RelativePath
    if (-not (Test-Path -LiteralPath $source -PathType Container)) {
        throw "Required release directory is missing: $RelativePath"
    }

    $destination = Join-Path $packageRoot $RelativePath
    Copy-Item -LiteralPath $source -Destination $destination -Recurse -Force
}

Assert-PathUnderRoot -Path $stageRoot -Root $buildRoot
if (Test-Path -LiteralPath $stageRoot) {
    Remove-Item -LiteralPath $stageRoot -Recurse -Force
}
New-Item -ItemType Directory -Path $stageRoot -Force | Out-Null
New-Item -ItemType Directory -Path $packageRoot -Force | Out-Null
New-Item -ItemType Directory -Path $distRoot -Force | Out-Null

$rootFiles = @(
    '.gitignore',
    'CHANGELOG.md',
    'DEVELOPMENT_HANDOVER.md',
    'index.html',
    'LICENSE',
    'package-lock.json',
    'package.json',
    'README.md',
    'RELEASE_CHECKLIST.md',
    'RELEASE_REVIEW.md',
    'THIRD_PARTY_NOTICES.md',
    'USER_GUIDE.md',
    'vite.config.js'
)

$sourceDirectories = @(
    'docs',
    'public',
    'scripts',
    'src'
)

$musicFiles = @(
    'music_data/01朝をひらくエッジ feat. CYAN.ogg',
    'music_data/01朝をひらくエッジ feat. CYAN.srt',
    'music_data/02白を追い越して feat. CYAN.ogg',
    'music_data/02白を追い越して feat. CYAN.srt',
    'music_data/03白に重なる軌道 feat. CYAN.ogg',
    'music_data/03白に重なる軌道 feat. CYAN.srt',
    'music_data/04影を抜ける呼吸 feat. CYAN.ogg',
    'music_data/04影を抜ける呼吸 feat. CYAN.srt',
    'music_data/05カップ越しの雪 feat. CYAN.ogg',
    'music_data/05カップ越しの雪 feat. CYAN.srt',
    'music_data/06怖さの横に feat. CYAN.ogg',
    'music_data/06怖さの横に feat. CYAN.srt',
    'music_data/07夜の白さを突き抜ける feat. CYAN.ogg',
    'music_data/07夜の白さを突き抜ける feat. CYAN.srt',
    'music_data/08次はもっと近くで feat. CYAN.ogg',
    'music_data/08次はもっと近くで feat. CYAN.srt',
    'music_data/game_menu.png'
)

$textureFiles = @(
    'textures/rock/rock-color.png',
    'textures/rock/rock-normal.png',
    'textures/rock/rock-roughness.png',
    'textures/snow-ground/base-color.jpg',
    'textures/snow-ground/normal.jpg',
    'textures/snow-ground/roughness-snow.jpg',
    'textures/tree/tree-atlas-normal.png',
    'textures/tree/tree-atlas.png'
)

foreach ($file in $rootFiles) {
    Copy-RequiredFile -RelativePath $file
}
foreach ($directory in $sourceDirectories) {
    Copy-RequiredDirectory -RelativePath $directory
}
foreach ($file in ($musicFiles + $textureFiles)) {
    Copy-RequiredFile -RelativePath $file
}

$obsoleteArchives = @(
    'snow-motion-v1.0.0.zip',
    'snow-motion-v1.0.0-github-pages.zip',
    'snow-motion-v1.0.0-source.zip'
)
foreach ($archiveName in $obsoleteArchives) {
    $candidate = Join-Path $distRoot $archiveName
    Assert-PathUnderRoot -Path $candidate -Root $distRoot
    if (Test-Path -LiteralPath $candidate) {
        Remove-Item -LiteralPath $candidate -Force
    }
}

Push-Location $stageRoot
try {
    & tar.exe -a -cf $archivePath $packageName
    if ($LASTEXITCODE -ne 0) {
        throw "tar.exe failed with exit code $LASTEXITCODE"
    }
}
finally {
    Pop-Location
}

$entries = @(& tar.exe -tf $archivePath)
if ($LASTEXITCODE -ne 0) {
    throw "Could not inspect generated archive: $archivePath"
}

$normalizedEntries = $entries | ForEach-Object { ($_ -replace '^\./', '') -replace '\\', '/' }
$unexpectedRootEntry = $normalizedEntries | Where-Object {
    $_ -ne "$packageName/" -and -not $_.StartsWith("$packageName/", [System.StringComparison]::Ordinal)
} | Select-Object -First 1
if ($unexpectedRootEntry) {
    throw "Generated archive contains an entry outside its top-level folder: $unexpectedRootEntry"
}

$contentEntries = $normalizedEntries | Where-Object { $_ -ne "$packageName/" } | ForEach-Object {
    $_.Substring($packageName.Length + 1)
}
$requiredEntries = @(
    'README.md',
    'LICENSE',
    'package.json',
    'package-lock.json',
    'src/game.js',
    'scripts/package-release.ps1',
    'docs/index.html',
    'docs/.nojekyll',
    'music_data/game_menu.png',
    'textures/tree/tree-atlas.png'
)
foreach ($entry in $requiredEntries) {
    if ($contentEntries -notcontains $entry) {
        throw "Generated archive is missing required entry: $entry"
    }
}

$forbiddenPatterns = @(
    '(^|/)node_modules/',
    '(^|/)build/',
    '(^|/)dist/',
    '(^|/)\.git/',
    '(^|/)tests/tmp/',
    '^AGENTS2?\.md$',
    '^HANDOFF\.md$',
    '^music_data/White Line ',
    '^music_data/playback point\.txt$',
    '^music_data/\d{2}.*\.png$',
    '^textures/.*\.zip$',
    '^textures/Texture_'
)
foreach ($entry in $contentEntries) {
    foreach ($pattern in $forbiddenPatterns) {
        if ($entry -match $pattern) {
            throw "Generated archive contains excluded entry: $entry"
        }
    }
}

$archive = Get-Item -LiteralPath $archivePath
Write-Host "Created canonical repository package: $($archive.FullName)"
Write-Host "Archive size: $([Math]::Round($archive.Length / 1MB, 2)) MiB"

Assert-PathUnderRoot -Path $stageRoot -Root $buildRoot
Remove-Item -LiteralPath $stageRoot -Recurse -Force
