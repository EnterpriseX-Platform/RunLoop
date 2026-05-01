// RunLoop — Build & push images to Docker Hub.
//
// Job locations (one build job per Jenkins folder; both fan out to the
// same image tag):
//   http://<jenkins-host>:32552/job/COMMUNITY/job/runloop/
//   http://<jenkins-host>:32552/job/COMMERCIAL/job/runloop/
//
// On success: triggers each downstream deploy job in DEPLOY_TARGETS
// (default = the deploy job in the same folder).
//
// Publishes two images per build:
//   avalantglobal/runloop-web:<TAG>
//   avalantglobal/runloop-engine:<TAG>
// where <TAG> = v1.<yyyymmdd-HHMM>-<short-sha>.

pipeline {
  agent any

  parameters {
    string(
      name: 'DEPLOY_TARGETS',
      defaultValue: './deploy-runloop-to-kube',
      description: 'Comma-separated Jenkins job paths to trigger after a successful push. Use "/COMMUNITY/deploy-runloop-to-kube,/COMMERCIAL/deploy-runloop-to-kube" to fan out to multiple environments. Set blank to skip auto-deploy.',
    )
  }

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

  // Auto-trigger: Jenkins polls the git remote every 5 minutes and
  // starts a build when it sees new commits on the tracked branch.
  // `H/5` = hash-spread over the 5-minute window (different jobs land
  // on different sub-minutes so the git server doesn't get hammered
  // at :00 :05 :10 ...). Replace with a real webhook later if/when
  // the git server can POST to Jenkins.
  triggers {
    pollSCM('H/5 * * * *')
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
      when { expression { return params.DEPLOY_TARGETS?.trim() } }
      steps {
        script {
          // Fan out to every configured downstream deploy. They run in
          // parallel (wait:false) — if one env is broken it shouldn't
          // block the others. Each deploy job picks up its own NAMESPACE
          // / DOMAIN / KUBECONFIG_CRED_ID from its own job-level params,
          // so we only need to pass the image tag.
          def targets = params.DEPLOY_TARGETS.split(',').collect{ it.trim() }.findAll{ it }
          targets.each { target ->
            echo "→ triggering ${target}"
            build job: target,
                  parameters: [string(name: 'IMAGE_TAG', value: "${TAG}")],
                  wait: false,
                  propagate: false
          }
        }
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
