param(
  [Parameter(Mandatory = $true)][string]$Text,
  [Parameter(Mandatory = $true)][string]$Output,
  [Parameter(Mandatory = $true)][string]$Voice,
  [Parameter(Mandatory = $true)][int]$Rate,
  [Parameter(Mandatory = $true)][int]$Volume
)

Add-Type -AssemblyName System.Speech
$synthesizer = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
  $synthesizer.SelectVoice($Voice)
  $synthesizer.Rate = $Rate
  $synthesizer.Volume = $Volume
  $synthesizer.SetOutputToWaveFile($Output)
  $synthesizer.Speak($Text)
}
finally {
  $synthesizer.Dispose()
}
