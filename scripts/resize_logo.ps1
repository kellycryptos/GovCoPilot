Add-Type -AssemblyName System.Drawing

$srcPath = "C:\Users\HP\.gemini\antigravity\brain\b7f6f470-5e85-408d-9119-c897963f5d87\govcopilot_avatar_1784967102023.jpg"
$destPath = "C:\Users\HP\Downloads\GovCoPilot\public\logo.png"

$srcImage = [System.Drawing.Image]::FromFile($srcPath)
Write-Host "Original Image Dimensions: $($srcImage.Width) x $($srcImage.Height)"

$targetWidth = 440
$targetHeight = 440

$destBitmap = New-Object System.Drawing.Bitmap($targetWidth, $targetHeight, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$graphics = [System.Drawing.Graphics]::FromImage($destBitmap)

$graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
$graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

# Draw full square 440x440 with sharp 90-degree corners
$rect = New-Object System.Drawing.Rectangle(0, 0, $targetWidth, $targetHeight)
$graphics.DrawImage($srcImage, $rect)

$destBitmap.Save($destPath, [System.Drawing.Imaging.ImageFormat]::Png)

$graphics.Dispose()
$destBitmap.Dispose()
$srcImage.Dispose()

# Verify new image
$newImage = [System.Drawing.Image]::FromFile($destPath)
Write-Host "Resized Image Dimensions: $($newImage.Width) x $($newImage.Height)"
$newImage.Dispose()
