param(
    [switch]$SkipPackages
)

$ErrorActionPreference = 'Stop'
$sourceRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $sourceRoot
$templatePath = Join-Path $sourceRoot 'index.template.html'
$manifestPath = Join-Path $sourceRoot 'activities.json'
$secondaryManifestPath = Join-Path $sourceRoot 'secondary_syllabus.json'
$threeModulePath = Join-Path $sourceRoot 'vendor\three.module.r150.js'
$katexVendorRoot = Join-Path $sourceRoot 'vendor\katex'
$sampleZip = Join-Path $projectRoot 'scorable_newTab_timeline_countable-nouns-are-nouns-that-can-be-counted-with-pictures-replacements-by-acp.zip'
$packageRoot = Join-Path $projectRoot '_packages'

if (-not (Test-Path -LiteralPath $sampleZip)) {
    throw "The proven xAPI sample ZIP is missing: $sampleZip"
}

$template = Get-Content -LiteralPath $templatePath -Raw -Encoding UTF8
$primaryActivities = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

function Test-ThreeActivity($activity) {
    $primaryKinds = @(
        'p2_3d_shapes',
        'p4_solid_representations', 'p4_draw_solid_representations',
        'p4_identify_nets', 'p4_net_to_solid',
        'p5_unit_cube_build', 'p5_cubic_units', 'p5_isometric_drawing',
        'p5_volume_formula', 'p5_tank_volume', 'p5_liquid_cm3',
        'p6_cuboid_missing_dimension', 'p6_cube_edge',
        'p6_cuboid_height', 'p6_face_area'
    )
    if ($primaryKinds -contains [string]$activity.kind) { return $true }
    if ([string]$activity.id -notmatch '^S\d+-') { return $false }
    $objective = ([string]$activity.objective).ToLowerInvariant()
    return (
        $objective.Contains('volume and surface area of prism and cylinder') -or
        $objective.Contains('volume and surface area of composite solids') -or
        $objective.Contains('volume and surface area of pyramid, cone and sphere') -or
        $objective.Contains('ratio of volumes of similar solids')
    )
}

if (-not (Test-Path -LiteralPath $threeModulePath)) {
    throw "The local Three.js source is missing: $threeModulePath"
}
$katexRequired = @('katex.min.js', 'katex.min.css', 'LICENSE')
foreach ($requiredName in $katexRequired) {
    $requiredPath = Join-Path $katexVendorRoot $requiredName
    if (-not (Test-Path -LiteralPath $requiredPath)) {
        throw "The local KaTeX source is missing: $requiredPath"
    }
}
if (-not (Test-Path -LiteralPath (Join-Path $katexVendorRoot 'fonts'))) {
    throw "The local KaTeX fonts are missing: $katexVendorRoot\fonts"
}
$threeModule = Get-Content -LiteralPath $threeModulePath -Raw -Encoding UTF8
$threeExport = [regex]::Match(
    $threeModule,
    'export\s*\{\s*(?<names>[\s\S]+?)\s*\};\s*$',
    [System.Text.RegularExpressions.RegexOptions]::CultureInvariant
)
if (-not $threeExport.Success) {
    throw 'Could not convert the local Three.js ES module to an offline classic-script runtime.'
}
$threeClassic = $threeModule.Substring(0, $threeExport.Index) +
    "window.THREE = { $($threeExport.Groups['names'].Value) };`r`n" +
    "window.dispatchEvent(new CustomEvent('famath-three-ready'));`r`n"
$threeClassicName = 'three.r150.classic.js'

function ConvertTo-FolderSlug([string]$value) {
    $symbolMap = @{
        ([string][char]0x2264) = ' less than or equal to '
        ([string][char]0x2265) = ' greater than or equal to '
        ([string][char]0x00D7) = ' times '
        ([string][char]0x00F7) = ' divided by '
        ([string][char]0x00B2) = ' squared '
        ([string][char]0x00B3) = ' cubed '
        ([string][char]0x207F) = ' power n '
        ([string][char]0x2212) = ' minus '
        ([string][char]0x03C0) = ' pi '
    }
    foreach ($entry in $symbolMap.GetEnumerator()) { $value = $value.Replace($entry.Key, $entry.Value) }
    $builder = New-Object System.Text.StringBuilder
    foreach ($character in $value.Normalize([System.Text.NormalizationForm]::FormD).ToCharArray()) {
        $category = [System.Globalization.CharUnicodeInfo]::GetUnicodeCategory($character)
        if ($category -ne [System.Globalization.UnicodeCategory]::NonSpacingMark -and [int]$character -lt 128) {
            [void]$builder.Append($character)
        }
    }
    $slug = [regex]::Replace($builder.ToString(), '[^A-Za-z0-9]+', '_').Trim('_')
    if ($slug.Length -gt 78) { $slug = $slug.Substring(0, 78).TrimEnd('_') }
    return $slug
}

function Get-SecondaryActivities([string]$path) {
    $manifest = Get-Content -LiteralPath $path -Raw -Encoding UTF8 | ConvertFrom-Json
    $expanded = New-Object System.Collections.Generic.List[object]
    foreach ($level in 1..5) {
        $records = $manifest.levels.PSObject.Properties[[string]$level].Value
        if ($records -is [string]) { $records = $manifest.PSObject.Properties[[string]$records].Value }
        $order = 0
        foreach ($record in @($records)) {
            $order++
            $sectionCode = [string]$record[0]
            $objectiveCode = [string]$record[1]
            $objectiveText = [string]$record[2]
            $family = [string]$record[3]
            $section = $manifest.sections.PSObject.Properties[$sectionCode].Value
            $slug = ConvertTo-FolderSlug $objectiveText
            $expanded.Add([pscustomobject]@{
                id = "S$level-$sectionCode-$objectiveCode"
                folder = ('Secondary{0}_{1:D2}_{2}_{3}_{4}' -f $level, $order, $sectionCode, $objectiveCode, $slug)
                strand = [string]$section[0]
                subStrand = "$sectionCode. $([string]$section[1])"
                section = $sectionCode
                objective = "$objectiveCode $objectiveText"
                shortTitle = "$sectionCode $objectiveCode - $objectiveText"
                kind = ("s{0}_{1}_{2}" -f $level, $sectionCode.ToLowerInvariant(), ($objectiveCode -replace '\.', '_'))
                family = $family
                grade = $level
                schoolStage = 'Secondary'
                curriculumSource = [string]$manifest.source
            })
        }
    }
    return $expanded.ToArray()
}

$secondaryActivities = Get-SecondaryActivities $secondaryManifestPath
$activities = @($primaryActivities + $secondaryActivities)

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$gradeOrder = @{}
for ($index = 0; $index -lt $activities.Count; $index++) {
    $activity = $activities[$index]
    if ($activity.id -notmatch '^(?<stage>[PS])(?<grade>\d+)-') {
        throw "Activity id does not begin with a grade marker: $($activity.id)"
    }
    $stage = [string]$Matches.stage
    $grade = [int]$Matches.grade
    $orderKey = "$stage$grade"
    if (-not $gradeOrder.ContainsKey($orderKey)) { $gradeOrder[$orderKey] = 0 }
    $gradeOrder[$orderKey]++
    $stageName = if ($stage -eq 'P') { 'Primary' } else { 'Secondary' }
    $expectedPrefix = '{0}{1}_{2:D2}_' -f $stageName, $grade, $gradeOrder[$orderKey]
    if (-not $activity.folder.StartsWith($expectedPrefix, [System.StringComparison]::Ordinal)) {
        throw "Activity $($activity.id) must use syllabus-order prefix $expectedPrefix in its folder name."
    }

    $legacyFolder = $activity.folder -replace "^${stageName}${grade}_\d{2}_", "${stageName}$grade`_"
    $legacyRoot = Join-Path $projectRoot $legacyFolder
    $orderedRoot = Join-Path $projectRoot $activity.folder
    if ((Test-Path -LiteralPath $legacyRoot) -and (Test-Path -LiteralPath $orderedRoot)) {
        throw "Both legacy and ordered activity folders exist. Resolve before building: $legacyRoot and $orderedRoot"
    }
    if (Test-Path -LiteralPath $legacyRoot) {
        Move-Item -LiteralPath $legacyRoot -Destination $orderedRoot
    }

    if (-not $SkipPackages) {
        [System.IO.Directory]::CreateDirectory($packageRoot) | Out-Null
        $legacyPackage = Join-Path $packageRoot ($legacyFolder + '_SLS_xAPI.zip')
        $orderedPackage = Join-Path $packageRoot ($activity.folder + '_SLS_xAPI.zip')
        if ((Test-Path -LiteralPath $legacyPackage) -and (Test-Path -LiteralPath $orderedPackage)) {
            throw "Both legacy and ordered packages exist. Resolve before building: $legacyPackage and $orderedPackage"
        }
        if (Test-Path -LiteralPath $legacyPackage) {
            Move-Item -LiteralPath $legacyPackage -Destination $orderedPackage
        }
    }
}

$sampleArchive = [System.IO.Compression.ZipFile]::OpenRead($sampleZip)
try {
    $wrapperEntry = $sampleArchive.GetEntry('lib/xapiwrapper.min.js')
    $glueEntry = $sampleArchive.GetEntry('lib/xAPI.js')
    if ($null -eq $wrapperEntry -or $null -eq $glueEntry) {
        throw 'The sample ZIP does not contain the proven lib/xapiwrapper.min.js and lib/xAPI.js files.'
    }

    if (-not $SkipPackages) {
        [System.IO.Directory]::CreateDirectory($packageRoot) | Out-Null
    }

    foreach ($activity in $activities) {
        $activityRoot = Join-Path $projectRoot $activity.folder
        $libRoot = Join-Path $activityRoot 'lib'
        [System.IO.Directory]::CreateDirectory($libRoot) | Out-Null

        $configJson = $activity | ConvertTo-Json -Depth 8 -Compress
        $usesThree = Test-ThreeActivity $activity
        $threeScript = if ($usesThree) { '<script src="./lib/three.r150.classic.js"></script>' } else { '' }
        $html = $template.Replace('__ACTIVITY_CONFIG__', $configJson).Replace('__THREE_RUNTIME_SCRIPT__', $threeScript)
        [System.IO.File]::WriteAllText((Join-Path $activityRoot 'index.html'), $html, $utf8NoBom)
        [System.IO.File]::WriteAllText((Join-Path $activityRoot 'activity.json'), ($activity | ConvertTo-Json -Depth 8), $utf8NoBom)

        if ($activity.id -notmatch '^(?<stage>[PS])(?<grade>\d+)-') { throw "Invalid activity id: $($activity.id)" }
        $stageName = if ($Matches.stage -eq 'P') { 'Primary' } else { 'Secondary' }
        $grade = [int]$Matches.grade
        $instruction = @"
FAMath $stageName $grade Formative Interactive
Activity: $($activity.shortTitle)
Learning objective: $($activity.objective)

Open index.html locally for offline practice.
For SLS, upload the matching ZIP from the _packages folder.
The ZIP uses the proven sample xAPI libraries and window.storeState strategy.
"@
        [System.IO.File]::WriteAllText((Join-Path $activityRoot 'instruction.txt'), $instruction, $utf8NoBom)

        foreach ($pair in @(
            @{ Entry = $wrapperEntry; Target = (Join-Path $libRoot 'xapiwrapper.min.js') },
            @{ Entry = $glueEntry; Target = (Join-Path $libRoot 'xAPI.js') }
        )) {
            $inputStream = $pair.Entry.Open()
            try {
                $outputStream = [System.IO.File]::Create($pair.Target)
                try { $inputStream.CopyTo($outputStream) } finally { $outputStream.Dispose() }
            } finally {
                $inputStream.Dispose()
            }
        }

        $katexTarget = Join-Path $libRoot 'katex'
        $resolvedActivityRoot = [System.IO.Path]::GetFullPath($activityRoot)
        $resolvedKatexTarget = [System.IO.Path]::GetFullPath($katexTarget)
        if (-not $resolvedKatexTarget.StartsWith($resolvedActivityRoot + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
            throw "Refusing to replace a KaTeX target outside its generated activity: $resolvedKatexTarget"
        }
        if (Test-Path -LiteralPath $katexTarget) {
            Remove-Item -LiteralPath $katexTarget -Recurse -Force
        }
        [System.IO.Directory]::CreateDirectory($katexTarget) | Out-Null
        Copy-Item -Path (Join-Path $katexVendorRoot '*') -Destination $katexTarget -Recurse -Force

        $threeTarget = Join-Path $libRoot $threeClassicName
        if ($usesThree) {
            [System.IO.File]::WriteAllText($threeTarget, $threeClassic, $utf8NoBom)
        } elseif (Test-Path -LiteralPath $threeTarget) {
            Remove-Item -LiteralPath $threeTarget -Force
        }

        if (-not $SkipPackages) {
            $packagePath = Join-Path $packageRoot ($activity.folder + '_SLS_xAPI.zip')
            if (Test-Path -LiteralPath $packagePath) {
                Remove-Item -LiteralPath $packagePath -Force
            }
            $archive = [System.IO.Compression.ZipFile]::Open($packagePath, [System.IO.Compression.ZipArchiveMode]::Create)
            try {
                Get-ChildItem -LiteralPath $activityRoot -File -Recurse | ForEach-Object {
                    $entryName = $_.FullName.Substring($activityRoot.Length + 1).Replace('\', '/')
                    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
                        $archive,
                        $_.FullName,
                        $entryName,
                        [System.IO.Compression.CompressionLevel]::Optimal
                    ) | Out-Null
                }
            } finally {
                $archive.Dispose()
            }
        }
    }
} finally {
    $sampleArchive.Dispose()
}

$stageGrades = $activities | ForEach-Object {
    if ($_.id -match '^(?<stage>[PS])(?<grade>\d+)-') {
        [pscustomobject]@{ Stage = [string]$Matches.stage; Grade = [int]$Matches.grade; Key = "$($Matches.stage)$($Matches.grade)" }
    }
} | Sort-Object Stage, Grade -Unique

foreach ($stageGrade in $stageGrades) {
    $stage = $stageGrade.Stage
    $grade = $stageGrade.Grade
    $stageName = if ($stage -eq 'P') { 'Primary' } else { 'Secondary' }
    $gradeActivities = @($activities | Where-Object { $_.id -match "^$stage$grade-" })
    $catalogRows = New-Object System.Collections.Generic.List[string]
    $markdownRows = New-Object System.Collections.Generic.List[string]
    $markdownRows.Add("# $stageName $grade FAMath syllabus order")
    $markdownRows.Add('')
    $markdownRows.Add('Folders use a two-digit syllabus position followed by the official strand and learning-objective code.')
    $markdownRows.Add('')
    $markdownRows.Add('| Order | Official ID | Strand / sub-strand | Learning objective | Activity folder | SLS xAPI ZIP |')
    $markdownRows.Add('|---:|---|---|---|---|---|')

    for ($index = 0; $index -lt $gradeActivities.Count; $index++) {
        $activity = $gradeActivities[$index]
        $order = $index + 1
        $folder = [System.Net.WebUtility]::HtmlEncode([string]$activity.folder)
        $id = [System.Net.WebUtility]::HtmlEncode([string]$activity.id)
        $strand = [System.Net.WebUtility]::HtmlEncode("$($activity.strand) / $($activity.subStrand)")
        $objective = [System.Net.WebUtility]::HtmlEncode([string]$activity.objective)
        $shortTitle = [System.Net.WebUtility]::HtmlEncode([string]$activity.shortTitle)
        $packageName = $activity.folder + '_SLS_xAPI.zip'
        $catalogRows.Add(@"
      <tr data-order="$order">
        <td><strong>$('{0:D2}' -f $order)</strong></td>
        <td><code>$id</code></td>
        <td>$strand</td>
        <td><strong>$objective</strong><br><span>$shortTitle</span></td>
        <td><a href="$folder/index.html">Open activity</a></td>
        <td><a href="_packages/$([System.Net.WebUtility]::HtmlEncode($packageName))">SLS ZIP</a></td>
      </tr>
"@)
        $markdownRows.Add("| $('{0:D2}' -f $order) | $($activity.id) | $($activity.strand) / $($activity.subStrand) | $($activity.objective) | [$($activity.folder)]($($activity.folder)/index.html) | [$packageName](_packages/$packageName) |")
    }

    $catalogHtml = @"
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>$stageName $grade FAMath - Syllabus Order</title>
  <style>
    :root{--navy:#082653;--teal:#079a9a;--line:#cbd8e8;--soft:#eef7fb}
    *{box-sizing:border-box}body{margin:0;color:var(--navy);font:16px/1.45 Arial,sans-serif;background:#fff}
    main{width:min(1180px,calc(100% - 28px));margin:24px auto 48px}h1{margin:0 0 6px;font-size:clamp(27px,4vw,42px)}
    .intro{margin:0 0 20px;color:#496480}.table-wrap{overflow:auto;border:1px solid var(--line);border-radius:14px}
    table{width:100%;border-collapse:collapse;min-width:850px}th,td{padding:12px;text-align:left;border-bottom:1px solid var(--line);vertical-align:top}
    th{position:sticky;top:0;background:var(--navy);color:#fff}tbody tr:nth-child(even){background:var(--soft)}
    td:first-child{font-size:21px;color:var(--teal)}td span{color:#58708f}a{display:inline-block;color:#075f73;font-weight:800}
    a:focus-visible{outline:4px solid rgba(23,105,210,.35);outline-offset:3px}
  </style>
</head>
<body>
  <main>
    <h1>$stageName $grade FAMath - syllabus order</h1>
    <p class="intro">The number 01-$($gradeActivities.Count) follows the Ministry of Education syllabus sequence. The official strand and learning-objective code remain visible in every folder name.</p>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Order</th><th>Official ID</th><th>Strand / sub-strand</th><th>Learning objective</th><th>Interactive</th><th>Package</th></tr></thead>
        <tbody>
$($catalogRows -join [Environment]::NewLine)
        </tbody>
      </table>
    </div>
  </main>
</body>
</html>
"@

    [System.IO.File]::WriteAllText((Join-Path $projectRoot "${stageName}${grade}_Syllabus_Order.html"), $catalogHtml, $utf8NoBom)
    $markdownName = if ($stage -eq 'P' -and $grade -eq 1) { 'SYLLABUS_ORDER.md' } else { "$(($stageName).ToUpperInvariant())${grade}_SYLLABUS_ORDER.md" }
    [System.IO.File]::WriteAllLines((Join-Path $projectRoot $markdownName), $markdownRows, $utf8NoBom)
}

Write-Output ("Built {0} activity folders{1}." -f $activities.Count, $(if ($SkipPackages) { '' } else { ' and SLS xAPI ZIP packages' }))
