module.exports = [
  {
    name: "Total bundle size",
    path: ".next/static/**/*.js",
    limit: "2.5 MB" // Realistic limit based on current 2.2MB + headroom
  },
  {
    name: "Main page first load",
    path: ".next/static/chunks/app/page-*.js",
    limit: "500 kB" // Based on actual 267kB + generous headroom
  },
  {
    name: "CSS bundle", 
    path: ".next/static/css/*.css",
    limit: "100 kB" // Based on actual 87.7kB + headroom
  }
];