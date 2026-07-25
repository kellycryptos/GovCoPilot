Add-Type -AssemblyName System.Drawing

$srcPath = "C:\Users\HP\Downloads\GovCoPilot\public\logo.png"
$destIcoPath = "C:\Users\HP\Downloads\GovCoPilot\public\favicon.ico"

$srcImage = [System.Drawing.Image]::FromFile($srcPath)

# Create 64x64 ico bitmap
$targetWidth = 64
$targetHeight = 64

$destBitmap = New-Object System.Drawing.Bitmap($targetWidth, $targetHeight, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$graphics = [System.Drawing.Graphics]::FromImage($destBitmap)

$graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
$graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

$rect = New-Object System.Drawing.Rectangle(0, 0, $targetWidth, $targetHeight)
$graphics.DrawImage($srcImage, $rect)

$icon = [System.Drawing.Icon]::FromHandle($destBitmap.GetHicon())
$fileStream = [System.IO.File]::Create($destIcoPath)
$icon.Save($fileStream)
$fileStream.Close()

$graphics.Dispose()
$destBitmap.Dispose()
$srcImage.Dispose()

Write-Host "Updated favicon.ico successfully!"
