@if "%DEBUG%"=="" @echo off
@rem ##########################################################################
@rem
@rem  Gradle startup script for Windows
@rem
@rem ##########################################################################

@rem Set local scope for the variables with windows NT shell
if "%OS%"=="Windows_NT" setlocal

set DIRNAME=%~dp0
if "%DIRNAME%"=="" set DIRNAME=.
@rem Resolve any "." and ".." in APP_HOME to make it shorter.
for %%i in ("%DIRNAME%") do set APP_HOME=%%~fi

set APP_BASE_NAME=%~n0
set APP_NAME=Gradle
@rem Add default JVM options here.
set DEFAULT_JVM_OPTS="-Xmx64m" "-Xms64m"

@rem Find java.exe
if defined JAVA_HOME goto findJavaFromJavaHome

set JAVA_EXE=java.exe
%JAVA_EXE% -version >NUL 2>&1
if %ERRORLEVEL% equ 0 goto execute

echo.
echo ERROR: JAVA_HOME is not set and no 'java' command could be found in your PATH.
echo.
echo Please set the JAVA_HOME variable in your environment to match the
echo location of your Java installation.
goto fail

:findJavaFromJavaHome
set JAVA_HOME=%JAVA_HOME:"=%
set JAVA_EXE=%JAVA_HOME%/bin/java.exe

if exist "%JAVA_EXE%" goto execute

echo.
echo ERROR: JAVA_HOME is set to an invalid directory: %JAVA_HOME%
echo.
echo Please set the JAVA_HOME variable in your environment to match the
echo location of your Java installation.
goto fail

:execute
@rem Setup the command line
set CLASSPATH=%APP_HOME%\gradle\wrapper\gradle-wrapper.jar

@rem Fail early with a clear message if the wrapper files are missing.
if not exist "%APP_HOME%\gradle\wrapper\gradle-wrapper.properties" (
  echo.
  echo ERROR: Missing gradle-wrapper.properties at:
  echo   %APP_HOME%\gradle\wrapper\gradle-wrapper.properties
  echo.
  echo If this project is on a network share path with spaces ^(e.g. PROJECT FILES^),
  echo open it from a local path without spaces, for example:
  echo   mklink /J D:\BalancioApp "%%~dp0.."
  echo   then open D:\BalancioApp in your IDE and run again.
  goto fail
)
if not exist "%CLASSPATH%" (
  echo.
  echo ERROR: Missing gradle-wrapper.jar at:
  echo   %CLASSPATH%
  echo Run "flutter create --platforms=android ." from the Flutter project root to restore it.
  goto fail
)

@rem Execute Gradle
"%JAVA_EXE%" %DEFAULT_JVM_OPTS% %JAVA_OPTS% %GRADLE_OPTS% "-Dorg.gradle.appname=%APP_BASE_NAME%" -classpath "%CLASSPATH%" org.gradle.wrapper.GradleWrapperMain %*

:end
@rem End local scope for the variables with windows NT shell
if %ERRORLEVEL% equ 0 goto mainEnd

:fail
rem Set variable GRADLE_EXIT_CONSOLE if you need the _script_ return code instead of
rem the cmd.exe /c return code!
set EXIT_CODE=%ERRORLEVEL%
if %EXIT_CODE% equ 0 set EXIT_CODE=1
if not ""=="%GRADLE_EXIT_CONSOLE%" exit %EXIT_CODE%
exit /b %EXIT_CODE%

:mainEnd
if "%OS%"=="Windows_NT" endlocal

:omega
