# Automated Homecare Newsletter

## TODO

- example + server api

- better styling...
  - more on theme with bcx

- cron job

---

- show dad

- tests

- see if i can find epic api

---

- determine if a good way to group newsletter content  
- CRON job
- Deploy using docker

## Roadmap

- [ ] something should test health of the app more than just when sending
- [ ] use ai to parse articles
- [ ] use actual machine learning
- [ ] Generic version of app that user can set up

--import ./dist/instrument.js

 && export VERSION=${VERSION:-$RAILWAY_GIT_COMMIT_SHA} && npm run sentry:sourcemaps

"sentry:sourcemaps": "sentry-cli releases files $VERSION upload-sourcemaps ./dist"
