# Mede o tempo de resposta do Supabase a partir da sua máquina (não imprime chaves).
# Uso (na pasta do projeto):  powershell -ExecutionPolicy Bypass -File .\scripts\medir-latencia.ps1
$url = ((Get-Content .env | Select-String '^NEXT_PUBLIC_SUPABASE_URL=').Line -split '=', 2)[1].Trim()
$alvo = "$url/auth/v1/health"
1..6 | ForEach-Object {
  $t = Get-Date
  try { Invoke-WebRequest -Uri $alvo -UseBasicParsing -TimeoutSec 20 | Out-Null } catch { }
  "{0} ms" -f [int]((Get-Date) - $t).TotalMilliseconds
}
