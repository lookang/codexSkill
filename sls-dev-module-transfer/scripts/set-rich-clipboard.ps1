[CmdletBinding(DefaultParameterSetName = "String")]
param(
    [Parameter(Mandatory = $true, ParameterSetName = "String")]
    [string] $HtmlFragment,

    [Parameter(Mandatory = $true, ParameterSetName = "File")]
    [string] $HtmlFile,

    [string] $PlainText,
    [string] $PlainTextFile
)

if ($PSCmdlet.ParameterSetName -eq "File") {
    $HtmlFragment = Get-Content -LiteralPath $HtmlFile -Raw -Encoding UTF8
}

if ($PlainTextFile) {
    $PlainText = Get-Content -LiteralPath $PlainTextFile -Raw -Encoding UTF8
}

if (-not $PlainText) {
    $PlainText = ($HtmlFragment -replace '<[^>]+>', ' ' -replace '\s+', ' ').Trim()
}

Add-Type -AssemblyName System.Windows.Forms

$prefix = "<html><body><!--StartFragment-->"
$suffix = "<!--EndFragment--></body></html>"
$html = $prefix + $HtmlFragment + $suffix
$headerTemplate = "Version:1.0`r`nStartHTML:0000000000`r`nEndHTML:0000000000`r`nStartFragment:0000000000`r`nEndFragment:0000000000`r`n"
$encoding = [System.Text.Encoding]::UTF8

$startHtml = $encoding.GetByteCount($headerTemplate)
$startFragment = $startHtml + $encoding.GetByteCount($prefix)
$endFragment = $startFragment + $encoding.GetByteCount($HtmlFragment)
$endHtml = $startHtml + $encoding.GetByteCount($html)

$header = "Version:1.0`r`nStartHTML:{0:D10}`r`nEndHTML:{1:D10}`r`nStartFragment:{2:D10}`r`nEndFragment:{3:D10}`r`n" -f $startHtml, $endHtml, $startFragment, $endFragment

$data = New-Object System.Windows.Forms.DataObject
$data.SetData([System.Windows.Forms.DataFormats]::Html, $header + $html)
$data.SetData([System.Windows.Forms.DataFormats]::Text, $PlainText.Trim())
[System.Windows.Forms.Clipboard]::SetDataObject($data, $true)

Write-Output "Rich HTML clipboard set."
