pipeline {
    agent {
        label any
    }

    stages {
        stage('Build') {
            steps {
                bat '''
                    node -e "const [major, minor] = process.versions.node.split('.').map(Number); if (major < 22 || (major === 22 && minor < 5)) { console.error('Node.js 22.5.0 or newer is required.'); process.exit(1); }"
                    if errorlevel 1 exit /b %errorlevel%
                    node --check server.js
                    if errorlevel 1 exit /b %errorlevel%
                    node --check db.js
                    if errorlevel 1 exit /b %errorlevel%
                    node --check public/app.js
                '''
            }
        }
    }
}
