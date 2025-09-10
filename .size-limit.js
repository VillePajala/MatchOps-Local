module.exports = [
  {
    name: "Client-side bundle",
    path: ".next/static/**/*.js",
    limit: "500 kB", // Updated based on actual 431kB + headroom for Sentry integration
    webpack: false,
    running: false
  },
  {
    name: "Main page bundle", 
    path: ".next/static/chunks/pages/index*.js",
    limit: "300 kB", // Updated based on 267kB app route + headroom
    webpack: false,
    running: false
  },
  {
    name: "App bundle (without vendors)",
    path: [
      ".next/static/chunks/*.js",
      "!.next/static/chunks/framework-*.js",
      "!.next/static/chunks/main-*.js",
      "!.next/static/chunks/webpack-*.js",
      "!.next/static/chunks/polyfills-*.js"
    ],
    limit: "300 kB", // Updated based on shared chunks size + headroom
    webpack: false,
    running: false
  },
  {
    name: "CSS bundle", 
    path: ".next/static/css/*.css",
    limit: "50 kB",
    webpack: false,
    running: false
  }
];