// RunLoop — Build & push images to Docker Hub.
//
// Job location:  http://10.1.102.52:32552/job/COMMUNITY/job/runloop/
// On success:    triggers job/COMMUNITY/job/deploy-runloop-to-kube/
//
// Publishes two images per build:
//   avalantglobal/runloop-web:<TAG>
//   avalantglobal/runloop-engine:<TAG>
// where <TAG> = v1.<yyyymmdd-HHMM>-<short-sha>.

pipeline {
  agent any

  environment {
    REGISTRY   = 'avalantglobal'
    WEB_IMAGE  = "${REGISTRY}/runloop-web"
    ENG_IMAGE  = "${REGISTRY}/runloop-engine"
    BUILD_DATE = sh(returnStdout: true, script: "date +%Y%m%d-%H%M").trim()
    GIT_SHORT  = sh(returnStdout: true, script: "git rev-parse --short HEAD").trim()
    TAG        = "v1.${BUILD_DATE}-${GIT_SHORT}"
  }

  options {
    timeout(time: 30, unit: 'MINUTES')
    disableConcurrentBuilds()
    buildDiscarder(logRotator(numToKeepStr: '20'))
  }

  stages {
    stage('Checkout') {
      steps {
        checkout scm
        sh 'git log -1 --oneline'
      }
    }

    stage('Build images') {
      parallel {
        stage('runloop-web') {
          steps {
            sh """
              docker build \
                --platform linux/amd64 \
                -f apps/runloop/Dockerfile \
                -t ${WEB_IMAGE}:${TAG} \
                -t ${WEB_IMAGE}:latest \
                apps/runloop
            """
          }
        }
        stage('runloop-engine') {
          steps {
            sh """
              docker build \
                --platform linux/amd64 \
                -f apps/runloop-engine/Dockerfile \
                -t ${ENG_IMAGE}:${TAG} \
                -t ${ENG_IMAGE}:latest \
                apps/runloop-engine
            """
          }
        }
      }
    }

    stage('Push') {
      steps {
        withCredentials([usernamePassword(
          credentialsId: 'docker-credential',
          usernameVariable: 'DH_USER',
          passwordVariable: 'DH_PASS',
        )]) {
          sh 'echo "$DH_PASS" | docker login -u "$DH_USER" --password-stdin'
          sh "docker push ${WEB_IMAGE}:${TAG}"
          sh "docker push ${WEB_IMAGE}:latest"
          sh "docker push ${ENG_IMAGE}:${TAG}"
          sh "docker push ${ENG_IMAGE}:latest"
        }
      }
    }

    stage('Trigger deploy') {
      steps {
        build job: '/COMMUNITY/deploy-runloop-to-kube',
              parameters: [string(name: 'IMAGE_TAG', value: "${TAG}")],
              wait: false
      }
    }
  }

  post {
    always {
      sh 'docker image prune -f --filter "until=24h" || true'
      sh 'docker logout || true'
    }
    success { echo "✅ Published ${WEB_IMAGE}:${TAG} + ${ENG_IMAGE}:${TAG}" }
    failure { echo "❌ Build failed for ${TAG}" }
  }
}
