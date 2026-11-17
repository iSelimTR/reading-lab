param([switch]$NoAutoStart)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class ReadingLabConsole {
  [DllImport("kernel32.dll")] public static extern IntPtr GetConsoleWindow();
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr handle, int command);
}
"@
$consoleHandle = [ReadingLabConsole]::GetConsoleWindow()
if ($consoleHandle -ne [IntPtr]::Zero) { [ReadingLabConsole]::ShowWindow($consoleHandle, 0) | Out-Null }

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
$script:service = $null
$script:starting = $false
$script:startDeadline = [DateTime]::MinValue
$script:nodePath = $null
$script:url = ''
$script:port = 3000
$mutexBytes = [System.Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($projectRoot.ToLowerInvariant()))
$mutexName = 'Local\ReadingLab-' + ([BitConverter]::ToString($mutexBytes).Replace('-','').Substring(0,16))
$mutexCreated = $false
$mutex = New-Object System.Threading.Mutex($true,$mutexName,[ref]$mutexCreated)
if (-not $mutexCreated) {
    [System.Windows.Forms.MessageBox]::Show('阅读控制窗口已经打开，请在任务栏中找到它。','Reading Lab') | Out-Null
    $mutex.Dispose()
    exit 0
}
function Find-ReadingNode {
    $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
    $candidates = @((Join-Path $projectRoot '.runtime\node.exe'),$(if ($nodeCommand) {$nodeCommand.Source}),$(if ($env:ProgramFiles) {Join-Path $env:ProgramFiles 'nodejs\node.exe'}),$(if ($env:LOCALAPPDATA) {Join-Path $env:LOCALAPPDATA 'Programs\nodejs\node.exe'}))
    foreach ($candidate in $candidates) {
        if ($candidate -and (Test-Path -LiteralPath $candidate -PathType Leaf)) {
            $version = & $candidate --version
            if ($LASTEXITCODE -eq 0 -and $version -match '^v(\d+)\.' -and [int]$Matches[1] -ge 22) { return $candidate }
        }
    }
    throw '没有找到 Node.js 22 或更高版本，请先安装 Node.js，或保留项目中的 .runtime 文件夹。'
}
function Test-ReadingProcess($processId) {
    $info = Get-CimInstance Win32_Process -Filter "ProcessId = $processId" -ErrorAction SilentlyContinue
    if (-not $info -or $info.ExecutablePath -ne $script:nodePath) { return $false }
    $absoluteServer = Join-Path $projectRoot 'src\server.js'
    if ($info.CommandLine -like ('*' + $absoluteServer + '*')) { return $true }
    $localRuntime = Join-Path $projectRoot '.runtime\node.exe'
    return ($info.ExecutablePath -eq $localRuntime -and $info.CommandLine -match '(?:^|\s)src[/\\]server\.js(?:\s|$)')
}
function Set-ReadingStatus($text,$running) {
    $statusLabel.Text = $text
    $statusLabel.ForeColor = if ($running) {[Drawing.ColorTranslator]::FromHtml('#136F63')} else {[Drawing.ColorTranslator]::FromHtml('#64736C')}
    $startButton.Enabled = -not $running -and -not $script:starting
    $stopButton.Enabled = $running -or $script:starting
    $webLink.Enabled = $running
    $openButton.Enabled = $running
}
function Stop-ReadingService {
    $script:starting = $false
    if ($script:service) {
        $script:service.Refresh()
        if (-not $script:service.HasExited) {
            if (-not (Test-ReadingProcess $script:service.Id)) { throw '服务进程身份发生变化，未停止其他程序。' }
            Stop-Process -Id $script:service.Id -ErrorAction Stop
            $script:service.WaitForExit(3000) | Out-Null
        }
        $script:service.Dispose()
        $script:service = $null
    }
    Set-ReadingStatus '● 服务已停止' $false
    $hintLabel.Text = '点击“启动服务”，再点击网页链接开始学习。'
}
function Start-ReadingService {
    try {
        if ($script:service -and -not $script:service.HasExited) { return }
        $script:nodePath = Find-ReadingNode
        foreach ($dependency in @('pdfjs-dist','tesseract.js')) {
            if (-not (Test-Path -LiteralPath (Join-Path $projectRoot "node_modules\$dependency\package.json"))) { throw '项目缺少依赖，请先在项目文件夹执行 npm.cmd install。' }
        }
        $configLines = @(& $script:nodePath --env-file-if-exists=.env (Join-Path $PSScriptRoot 'launcher-info.mjs'))
        if ($LASTEXITCODE -ne 0) { throw '本地配置有误，请检查 .env 中的 PORT。' }
        $config = $configLines[-1] | ConvertFrom-Json
        $script:port = [int]$config.port
        $script:url = [string]$config.url
        $webLink.Text = $script:url
        $script:starting = $true
        Set-ReadingStatus '● 正在启动…' $false
        $occupied = @([Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners() | Where-Object {$_.Port -eq $script:port})
        if ($occupied.Count) {
            $owners = @((Get-NetTCPConnection -LocalPort $script:port -State Listen -ErrorAction Stop).OwningProcess | Select-Object -Unique)
            if ($owners.Count -ne 1 -or -not (Test-ReadingProcess $owners[0])) { throw "端口 $($script:port) 被其他程序使用；未停止其他程序。请修改 .env 中的 PORT 后重试。" }
            $script:service = [Diagnostics.Process]::GetProcessById($owners[0])
            $hintLabel.Text = '已连接本项目正在运行的服务，可在这里统一关闭。'
        } else {
            $serverPath = Join-Path $projectRoot 'src\server.js'
            $script:service = Start-Process -FilePath $script:nodePath -ArgumentList '--env-file-if-exists=.env',('"' + $serverPath + '"') -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $projectRoot 'local-server.log') -RedirectStandardError (Join-Path $projectRoot 'local-server-error.log')
            $hintLabel.Text = '服务启动后，点击下方链接或“打开网页”。'
        }
        $script:startDeadline = [DateTime]::Now.AddSeconds(12)
    } catch {
        $script:starting = $false
        Set-ReadingStatus '● 启动失败' $false
        $hintLabel.Text = $_.Exception.Message
    }
}
function Open-ReadingPage {
    if ($openButton.Enabled) { Start-Process $script:url }
}
$form = New-Object System.Windows.Forms.Form
$form.Text = 'Reading Lab 控制台'
$form.ClientSize = New-Object Drawing.Size(540,365)
$form.StartPosition = 'CenterScreen'
$form.FormBorderStyle = 'FixedDialog'
$form.MaximizeBox = $false
$form.BackColor = [Drawing.ColorTranslator]::FromHtml('#F6F5EF')
$form.Font = New-Object Drawing.Font('Microsoft YaHei UI',10)
$form.AutoScaleMode = 'Dpi'
$title = New-Object Windows.Forms.Label
$title.Text = 'Reading Lab'
$title.Font = New-Object Drawing.Font('Segoe UI',23,[Drawing.FontStyle]::Bold)
$title.ForeColor = [Drawing.ColorTranslator]::FromHtml('#136F63')
$title.SetBounds(28,20,480,48)
$form.Controls.Add($title)
$subtitle = New-Object Windows.Forms.Label
$subtitle.Text = '你的阅读练习室 · 本地服务控制'
$subtitle.SetBounds(31,72,480,27)
$form.Controls.Add($subtitle)
$statusLabel = New-Object Windows.Forms.Label
$statusLabel.Font = New-Object Drawing.Font('Microsoft YaHei UI',12,[Drawing.FontStyle]::Bold)
$statusLabel.SetBounds(30,119,480,30)
$form.Controls.Add($statusLabel)
$hintLabel = New-Object Windows.Forms.Label
$hintLabel.SetBounds(31,155,478,49)
$hintLabel.ForeColor = [Drawing.ColorTranslator]::FromHtml('#64736C')
$form.Controls.Add($hintLabel)
$webLink = New-Object Windows.Forms.LinkLabel
$webLink.Text = 'http://127.0.0.1:3000'
$webLink.Font = New-Object Drawing.Font('Segoe UI',13)
$webLink.LinkColor = [Drawing.ColorTranslator]::FromHtml('#136F63')
$webLink.SetBounds(31,207,478,32)
$webLink.Add_LinkClicked({Open-ReadingPage})
$form.Controls.Add($webLink)
function New-ControlButton($text,$left,$width) {
    $button = New-Object Windows.Forms.Button
    $button.Text = $text
    $button.SetBounds($left,255,$width,42)
    $button.FlatStyle = 'Flat'
    $button.BackColor = [Drawing.Color]::White
    $form.Controls.Add($button)
    return $button
}
$startButton = New-ControlButton '启动服务' 30 143
$startButton.BackColor = [Drawing.ColorTranslator]::FromHtml('#136F63')
$startButton.ForeColor = [Drawing.Color]::White
$openButton = New-ControlButton '打开网页 ↗' 188 143
$stopButton = New-ControlButton '停止服务' 346 163
$startButton.Add_Click({Start-ReadingService})
$openButton.Add_Click({Open-ReadingPage})
$stopButton.Add_Click({try {Stop-ReadingService} catch {$hintLabel.Text = $_.Exception.Message}})
$footer = New-Object Windows.Forms.Label
$footer.Text = '关闭此窗口会停止阅读服务；关闭网页本身不会停止服务。'
$footer.Font = New-Object Drawing.Font('Microsoft YaHei UI',9)
$footer.ForeColor = [Drawing.ColorTranslator]::FromHtml('#64736C')
$footer.SetBounds(30,318,483,27)
$form.Controls.Add($footer)
Set-ReadingStatus '● 服务未启动' $false
$hintLabel.Text = '点击“启动服务”，再点击网页链接开始学习。'
$timer = New-Object Windows.Forms.Timer
$timer.Interval = 500
$timer.Add_Tick({
    if (-not $script:service) {return}
    try {
        $script:service.Refresh()
        if ($script:service.HasExited) {
            $script:starting = $false
            Set-ReadingStatus '● 服务已停止' $false
            $hintLabel.Text = '服务已退出。如启动失败，请检查项目中的 local-server-error.log。'
            $script:service.Dispose(); $script:service = $null
        } elseif ($script:starting) {
            $request = [Net.WebRequest]::Create($script:url + '/api/config')
            $request.Timeout = 350
            $request.Proxy = $null
            try {
                $response = $request.GetResponse(); $response.Close()
                $script:starting = $false
                Set-ReadingStatus '● 服务已运行' $true
                $hintLabel.Text = '点击链接打开练习网页，学习结束后可停止服务或关闭窗口。'
            } catch {
                # An app password is a valid running service too.
                if ($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -eq 401) {
                    $_.Exception.Response.Close()
                    $script:starting = $false
                    Set-ReadingStatus '● 服务已运行' $true
                } elseif ([DateTime]::Now -gt $script:startDeadline) {
                    Stop-ReadingService
                    $hintLabel.Text = '启动超时，请检查 local-server-error.log 后重试。'
                }
            }
        }
    } catch {$hintLabel.Text = '无法读取服务状态，请关闭窗口后重新打开。'}
})
$form.Add_Shown({$form.WindowState = 'Minimized'; $form.WindowState = 'Normal'; $form.Activate(); $timer.Start(); if (-not $NoAutoStart) {Start-ReadingService}})
$form.Add_FormClosing({
    param($sender,$eventArgs)
    try {Stop-ReadingService} catch {$eventArgs.Cancel = $true; $hintLabel.Text = $_.Exception.Message}
})
try {[Windows.Forms.Application]::Run($form)} finally {
    $timer.Stop(); $timer.Dispose(); $form.Dispose()
    $mutex.ReleaseMutex(); $mutex.Dispose()
}
