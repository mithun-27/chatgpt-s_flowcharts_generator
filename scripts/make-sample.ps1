Add-Type -AssemblyName System.Drawing

$width = 1000
$height = 980
$bitmap = New-Object System.Drawing.Bitmap($width, $height)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

$graphics.Clear([System.Drawing.Color]::FromArgb(248, 250, 252))

$gridPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(226, 232, 240), 1)
for ($x = 0; $x -lt $width; $x += 24) {
  $graphics.DrawLine($gridPen, $x, 0, $x, $height)
}
for ($y = 0; $y -lt $height; $y += 24) {
  $graphics.DrawLine($gridPen, 0, $y, $width, $y)
}

$titleFont = New-Object System.Drawing.Font("Segoe UI", 24, [System.Drawing.FontStyle]::Bold)
$subFont = New-Object System.Drawing.Font("Segoe UI", 12, [System.Drawing.FontStyle]::Regular)
$labelFont = New-Object System.Drawing.Font("Segoe UI", 13, [System.Drawing.FontStyle]::Bold)
$smallFont = New-Object System.Drawing.Font("Segoe UI", 11, [System.Drawing.FontStyle]::Bold)
$darkBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(15, 23, 42))
$mutedBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(100, 116, 139))
$whiteBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
$arrowPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(100, 116, 139), 2)
$arrowPen.EndCap = [System.Drawing.Drawing2D.LineCap]::ArrowAnchor
$arrowPen.CustomEndCap = New-Object System.Drawing.Drawing2D.AdjustableArrowCap(5, 5, $true)

$graphics.DrawString("Support ticket triage", $titleFont, $darkBrush, 48, 34)
$graphics.DrawString("Customer support workflow", $subFont, $mutedBrush, 50, 76)

function Draw-RoundedRect {
  param($x, $y, $w, $h, $radius, $fill, $stroke, $strokeWidth)
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $radius * 2
  $path.AddArc($x, $y, $d, $d, 180, 90)
  $path.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $path.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $path.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $path.CloseFigure()
  $fillBrush = New-Object System.Drawing.SolidBrush($fill)
  $strokePen = New-Object System.Drawing.Pen($stroke, $strokeWidth)
  $graphics.FillPath($fillBrush, $path)
  $graphics.DrawPath($strokePen, $path)
  return $path
}

function Draw-NodeLabel {
  param($text, $x, $y, $w, $h)
  $format = New-Object System.Drawing.StringFormat
  $format.Alignment = [System.Drawing.StringAlignment]::Center
  $format.LineAlignment = [System.Drawing.StringAlignment]::Center
  $rect = New-Object System.Drawing.RectangleF($x, $y, $w, $h)
  $graphics.DrawString($text, $labelFont, $darkBrush, $rect, $format)
}

function Draw-Arrow {
  param($x1, $y1, $x2, $y2)
  $graphics.DrawLine($arrowPen, $x1, $y1, $x2, $y2)
}

# Start
$path = Draw-RoundedRect 390 125 220 62 31 ([System.Drawing.Color]::FromArgb(220, 252, 231)) ([System.Drawing.Color]::FromArgb(74, 222, 128)) 2.5
Draw-NodeLabel "Ticket submitted" 390 125 220 62

# Process
$path = Draw-RoundedRect 365 235 270 68 12 ([System.Drawing.Color]::FromArgb(241, 245, 249)) ([System.Drawing.Color]::FromArgb(148, 163, 184)) 2.5
Draw-NodeLabel "Classify ticket" 365 235 270 68

# Decision diamond
$right = 710
$bottom = 470
$left = 290
$top = 350
$points = @(
  (New-Object System.Drawing.PointF(500, $top)),
  (New-Object System.Drawing.PointF($right, 410)),
  (New-Object System.Drawing.PointF(500, $bottom)),
  (New-Object System.Drawing.PointF($left, 410))
)
$fillBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(254, 243, 199))
$strokePen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(251, 191, 36), 2.5)
$graphics.FillPolygon($fillBrush, [System.Drawing.PointF[]]$points)
$graphics.DrawPolygon($strokePen, [System.Drawing.PointF[]]$points)
Draw-NodeLabel "Urgent?" 380 378 240 64

# Branch nodes
$path = Draw-RoundedRect 130 555 290 76 12 ([System.Drawing.Color]::FromArgb(255, 228, 230)) ([System.Drawing.Color]::FromArgb(251, 113, 133)) 2.5
Draw-NodeLabel "Escalate to on-call" 130 555 290 76

$path = Draw-RoundedRect 580 555 290 76 12 ([System.Drawing.Color]::FromArgb(241, 245, 249)) ([System.Drawing.Color]::FromArgb(148, 163, 184)) 2.5
Draw-NodeLabel "Add to sprint backlog" 580 555 290 76

# Parallelogram: send update
$ioPoints = @(
  (New-Object System.Drawing.PointF(405, 700)),
  (New-Object System.Drawing.PointF(700, 700)),
  (New-Object System.Drawing.PointF(660, 770)),
  (New-Object System.Drawing.PointF(365, 770))
)
$fillBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(224, 242, 254))
$strokePen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(56, 189, 248), 2.5)
$graphics.FillPolygon($fillBrush, [System.Drawing.PointF[]]$ioPoints)
$graphics.DrawPolygon($strokePen, [System.Drawing.PointF[]]$ioPoints)
Draw-NodeLabel "Send customer update" 395 700 250 70

# End
$path = Draw-RoundedRect 390 820 220 62 31 ([System.Drawing.Color]::FromArgb(220, 252, 231)) ([System.Drawing.Color]::FromArgb(74, 222, 128)) 2.5
Draw-NodeLabel "Ticket resolved" 390 820 220 62

# Arrows
Draw-Arrow 500 187 500 235
Draw-Arrow 500 303 500 350
Draw-Arrow 500 470 500 555

# Curved elbows approximated with line segments
Draw-Arrow 500 470 500 512
Draw-Arrow 500 512 275 512
Draw-Arrow 275 512 275 555

Draw-Arrow 500 512 725 512
Draw-Arrow 725 512 725 555

Draw-Arrow 275 631 275 680
Draw-Arrow 275 680 365 680
Draw-Arrow 365 680 365 700

Draw-Arrow 725 631 725 680
Draw-Arrow 725 680 660 680
Draw-Arrow 660 680 660 700

Draw-Arrow 500 770 500 820

# Edge labels
$graphics.DrawString("Yes", $smallFont, $mutedBrush, 385, 485)
$graphics.DrawString("No", $smallFont, $mutedBrush, 610, 485)

$output = Join-Path $PSScriptRoot "..\public\samples\support-ticket-flow.png"
$output = [System.IO.Path]::GetFullPath($output)
$dir = [System.IO.Path]::GetDirectoryName($output)
if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
$bitmap.Save($output, [System.Drawing.Imaging.ImageFormat]::Png)

$graphics.Dispose()
$bitmap.Dispose()
Write-Output "Wrote $output"
