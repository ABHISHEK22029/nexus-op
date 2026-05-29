@REM ----------------------------------------------------------------------------
@REM Maven Start Up Batch script
@REM ----------------------------------------------------------------------------

@IF "%__MVNW_ARG0_NAME__%"=="" (SET "BASE_DIR=%~dp0")

@SET MAVEN_PROJECTBASEDIR=%MAVEN_BASEDIR%
@IF NOT "%MAVEN_PROJECTBASEDIR%"=="" GOTO endDetectBaseDir

@SET EXEC_DIR=%CD%
@SET WDIR=%EXEC_DIR%
:findBaseDir
@IF EXIST "%WDIR%"\.mvn GOTO baseDirFound
@cd ..
@SET WDIR=%CD%
@GOTO findBaseDir

:baseDirFound
@SET MAVEN_PROJECTBASEDIR=%WDIR%
@cd "%EXEC_DIR%"

:endDetectBaseDir

@SET MVNW_USERNAME=%USERNAME%

@IF NOT "%MVNW_REPOURL%" == "" GOTO skipMvnwRepoUrl
@SET "MVNW_REPOURL=https://repo.maven.apache.org/maven2"

:skipMvnwRepoUrl

@SET WRAPPER_JAR="%MAVEN_PROJECTBASEDIR%\.mvn\wrapper\maven-wrapper.jar"
@SET WRAPPER_LAUNCHER=org.apache.maven.wrapper.MavenWrapperMain

@SET DOWNLOAD_URL="%MVNW_REPOURL%/org/apache/maven/wrapper/maven-wrapper/3.2.0/maven-wrapper-3.2.0.jar"

@FOR /F "usebackq tokens=1,2 delims==" %%A IN ("%MAVEN_PROJECTBASEDIR%\.mvn\wrapper\maven-wrapper.properties") DO (
    @IF "%%A"=="wrapperUrl" SET DOWNLOAD_URL=%%B
)

@IF EXIST %WRAPPER_JAR% (
    @SET INIT_CALL="%JAVA_HOME%\bin\java" -cp %WRAPPER_JAR% %WRAPPER_LAUNCHER% %MAVEN_CONFIG% %*
) ELSE (
    @SET INIT_CALL="%JAVA_HOME%\bin\java" -Dmaven.multiModuleProjectDirectory="%MAVEN_PROJECTBASEDIR%" ^
        -Dmaven.home="%M2_HOME%" -Dclassworlds.conf="%M2_HOME%\bin\m2.conf" ^
        "-Dmaven.repo.local=%USERPROFILE%\.m2\repository" ^
        -jar %WRAPPER_JAR% %MAVEN_CONFIG% %*
)

@REM -- Download the wrapper jar if not present
@IF NOT EXIST %WRAPPER_JAR% (
    @SET JAVA_EXE=java.exe
    @IF NOT "%JAVA_HOME%"=="" SET "JAVA_EXE=%JAVA_HOME%\bin\java.exe"

    @ECHO Downloading Maven Wrapper...
    powershell -Command "&{"^
    "$webclient = new-object System.Net.WebClient;"^
    "if ($env:MVNW_USERNAME -ne '' -and $env:MVNW_PASSWORD -ne '') {"^
    "$webclient.Credentials = new-object System.Net.NetworkCredential($env:MVNW_USERNAME, $env:MVNW_PASSWORD);"^
    "}"^
    "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12;"^
    "$webclient.DownloadFile('%DOWNLOAD_URL%', '%WRAPPER_JAR%')"^
    "}"
    @IF "%ERRORLEVEL%"=="0" (ECHO Done) ELSE (
        ECHO Failed to download Maven wrapper
        EXIT /B 1
    )
)

@%INIT_CALL%
