Add-Type -AssemblyName System.Drawing

$size = 512
$bmp = New-Object System.Drawing.Bitmap($size, $size)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$g.Clear([System.Drawing.Color]::Transparent)

function New-RoundedPath([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
    $p = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = $r * 2
    $p.AddArc($x, $y, $d, $d, 180, 90)
    $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
    $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
    $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
    $p.CloseFigure()
    return $p
}

$outer = New-RoundedPath 24 24 464 464 112
$gradientRect = New-Object System.Drawing.RectangleF(24, 24, 464, 464)
$gradient = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    $gradientRect,
    [System.Drawing.Color]::FromArgb(255, 23, 35, 51),
    [System.Drawing.Color]::FromArgb(255, 7, 12, 18),
    132
)
$g.FillPath($gradient, $outer)

$borderPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(92, 126, 231, 200), 3)
$g.DrawPath($borderPen, $outer)

$inner = New-RoundedPath 48 48 416 416 92
$innerPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(28, 180, 230, 215), 2)
$g.DrawPath($innerPen, $inner)

$font = New-Object System.Drawing.Font('Consolas', 184, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$format = New-Object System.Drawing.StringFormat
$format.Alignment = [System.Drawing.StringAlignment]::Center
$format.LineAlignment = [System.Drawing.StringAlignment]::Center

$caretBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 236, 246, 255))
$underscoreBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 110, 231, 200))

$caretRect = New-Object System.Drawing.RectangleF(80, 92, 230, 340)
$underscoreRect = New-Object System.Drawing.RectangleF(244, 106, 200, 340)
$g.DrawString('>', $font, $caretBrush, $caretRect, $format)
$g.DrawString('_', $font, $underscoreBrush, $underscoreRect, $format)

$out = Join-Path $PSScriptRoot 'icon.png'
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)

$g.Dispose()
$bmp.Dispose()
$font.Dispose()
$format.Dispose()
$gradient.Dispose()
$borderPen.Dispose()
$innerPen.Dispose()
$caretBrush.Dispose()
$underscoreBrush.Dispose()
$outer.Dispose()
$inner.Dispose()

Write-Output $out
