@echo off
rem Gera o instalador do BoomCalc no Windows. Rode com duplo clique ou no Prompt de Comando, de dentro da pasta empacotar.
rem Precisa de: Python 3.12 (python.org) e Inno Setup 6 (jrsoftware.org/isdl.php).
setlocal
cd /d "%~dp0\.."

echo [1/5] Criando ambiente de empacotamento...
python -m venv .venv-empacotar || goto :erro
call .venv-empacotar\Scripts\activate.bat || goto :erro
python -m pip install --quiet --upgrade pip
python -m pip install --quiet -r requirements.txt pyinstaller || goto :erro

echo [2/5] Conferindo o projeto (senhas e arquivos)...
python empacotar\verificar_antes_de_empacotar.py || goto :erro

echo [3/5] Gerando o executavel...
python -m PyInstaller empacotar\boomcalc.spec --noconfirm --clean || goto :erro

echo [4/5] Gerando o instalador...
set "ISCC=%ProgramFiles(x86)%\Inno Setup 6\ISCC.exe"
if not exist "%ISCC%" set "ISCC=%ProgramFiles%\Inno Setup 6\ISCC.exe"
if not exist "%ISCC%" set "ISCC=%LOCALAPPDATA%\Programs\Inno Setup 6\ISCC.exe"
if not exist "%ISCC%" (
  echo Inno Setup 6 nao encontrado. Instale em https://jrsoftware.org/isdl.php e rode de novo.
  goto :erro
)
"%ISCC%" empacotar\boomcalc.iss || goto :erro

echo [5/5] Pronto!
echo O instalador esta em: %CD%\empacotar\saida\BoomCalc-Setup.exe
pause
exit /b 0

:erro
echo.
echo Algo deu errado (veja a mensagem acima).
pause
exit /b 1
