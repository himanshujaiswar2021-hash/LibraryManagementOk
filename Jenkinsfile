pipeline {
    agent any

    stages {
        stage('Build') {
            steps {
                script {
                    if (isUnix()) {
                        sh '''
                            node -e 'const [major, minor] = process.versions.node.split(".").map(Number); if (major < 22 || (major === 22 && minor < 5)) { console.error("Node.js 22.5.0 or newer is required."); process.exit(1); }' &&
                            node --check server.js &&
                            node --check db.js &&
                            node --check public/app.js
                        '''
                    } else {
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
    }
}
