Add-Type -AssemblyName System.Drawing

function Create-ShieldIcon ([int]$size) {
    Write-Host "Creating icon: $size"
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

    # Background: Green Rounded Rect #10b981
    $greenBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(16,185,129))
    
    # Draw rounded rect (simplified as full rounded rect path)
    if ($size -ge 48) {
        $radius = [int]($size * 0.2)
        $diameter = $radius * 2
        $path = New-Object System.Drawing.Drawing2D.GraphicsPath
        # Need strict int for Arc
        $path.AddArc(0, 0, $diameter, $diameter, 180, 90)
        $path.AddArc(($size - $diameter), 0, $diameter, $diameter, 270, 90)
        $path.AddArc(($size - $diameter), ($size - $diameter), $diameter, $diameter, 0, 90)
        $path.AddArc(0, ($size - $diameter), $diameter, $diameter, 90, 90)
        $path.CloseFigure()
        $g.FillPath($greenBrush, $path)
        $path.Dispose()
    } else {
        $g.FillRectangle($greenBrush, 0, 0, $size, $size)
    }

    # Shield Outline: Black
    $scale = [float]$size / 128.0
    
    # Points scaled
    $x1 = 64.0 * $scale; $y1 = 30.0 * $scale # Top Peak
    $x2 = 96.0 * $scale; $y2 = 46.0 * $scale # Top Right
    $x3 = 96.0 * $scale; $y3 = 68.0 * $scale # Right Side Bottom
    $x4 = 64.0 * $scale; $y4 = 108.0 * $scale # Bottom Tip
    $x5 = 32.0 * $scale; $y5 = 68.0 * $scale # Left Side Bottom
    $x6 = 32.0 * $scale; $y6 = 46.0 * $scale # Top Left

    # Control Points for curves
    # Curve 1: p3 to p4 (Right bottom)
    $cx1 = 96.0 * $scale; $cy1 = 92.0 * $scale
    $cx2 = 80.0 * $scale; $cy2 = 104.0 * $scale
    
    # Curve 2: p4 to p5 (Left bottom)
    $cx3 = 48.0 * $scale; $cy3 = 104.0 * $scale
    $cx4 = 32.0 * $scale; $cy4 = 92.0 * $scale

    $sp = New-Object System.Drawing.Drawing2D.GraphicsPath
    $sp.StartFigure()
    # Use AddLine(float x1, float y1, float x2, float y2)
    $sp.AddLine($x6, $y6, $x1, $y1)
    $sp.AddLine($x1, $y1, $x2, $y2)
    $sp.AddLine($x2, $y2, $x3, $y3)
    $sp.AddBezier($x3, $y3, $cx1, $cy1, $cx2, $cy2, $x4, $y4)
    $sp.AddBezier($x4, $y4, $cx3, $cy3, $cx4, $cy4, $x5, $y5)
    $sp.AddLine($x5, $y5, $x6, $y6)
    $sp.CloseFigure()

    # Draw Outline
    $penWidth = [math]::Max(2.0, 6.0 * $scale)
    $blackPen = New-Object System.Drawing.Pen([System.Drawing.Color]::Black, $penWidth)
    $blackPen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
    $g.DrawPath($blackPen, $sp)

    $sp.Dispose()
    $g.Dispose()
    
    $outFile = "d:\Hackathons\Elvion\extension\icons\icon$size.png"
    if (Test-Path $outFile) { Remove-Item $outFile }
    $bmp.Save($outFile, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Host "Created icon$size.png"
}

Create-ShieldIcon 128
Create-ShieldIcon 48
Create-ShieldIcon 16
