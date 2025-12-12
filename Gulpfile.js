// Modern Gulpfile with async/await, modular tasks, and improved config
const gulp = require("gulp");
const fs = require("fs");
const { rimraf } = require("rimraf");
const gulpLoadPlugins = require("gulp-load-plugins");
const plugins = gulpLoadPlugins();
const noop = require("gulp-noop");
const uglify = require("gulp-uglify-es").default;
const rollupStream = require("@rollup/stream");
const rollupBabel = require("@rollup/plugin-babel").default;
const rollupResolve = require("@rollup/plugin-node-resolve").default;
const rollupCommonjs = require("@rollup/plugin-commonjs");
const rollupReplace = require("@rollup/plugin-replace");
const source = require("vinyl-source-stream");
const buffer = require("vinyl-buffer");
const sass = require("gulp-sass")(require("sass"));
const javascriptObfuscator = require("gulp-javascript-obfuscator");
const path = require("path");
const rev = require("gulp-rev");

// Configurable options (adjusted for your structure)
const config = {
  assetsCssDir: "src/assets/scss",
  assetsJsDir: "src/assets/js",
  libCssDir: "src/library/scss",
  libJsDir: "src/library/js",
  nodeDir: "node_modules",
  sassPattern: "scss/**/*.scss",
  jsPattern: "js/**/*.js",
  cssManifestPath: "dist/rev/manifest-css.json",
  jsManifestPath: "dist/rev/manifest-js.json",
  cssOutDir: "dist/css",
  jsOutDir: "dist/js",
};

// Utility: Remove old hashed files not in manifest
function cleanupOldFiles(dir, manifestPath, ext) {
  return async function cleanupTask(done) {
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      const keepFiles = new Set(Object.values(manifest));
      const files = fs.readdirSync(dir);
      for (const file of files) {
        if (file.endsWith(ext) && !keepFiles.has(file)) {
          fs.unlinkSync(path.join(dir, file));
          // Also try to remove sourcemap if present
          const mapFile = file + ".map";
          if (fs.existsSync(path.join(dir, mapFile))) {
            fs.unlinkSync(path.join(dir, mapFile));
          }
        }
      }
      done && done();
    } catch (e) {
      console.error("[Cleanup] Error:", e);
      done && done(e);
    }
  };
}

gulp.task(
  "clean-old-js",
  cleanupOldFiles(config.jsOutDir, config.jsManifestPath, ".js")
);
gulp.task(
  "clean-old-css",
  cleanupOldFiles(config.cssOutDir, config.cssManifestPath, ".css")
);

// Detect production mode at runtime via NODE_ENV or --production
function isProduction() {
  return (
    process.env.NODE_ENV === "production" ||
    process.argv.includes("--production")
  );
}
function useSourceMaps() {
  return !isProduction(); // Enable sourcemaps in dev, disable in production
}

// Helper to set production env when running the `prod` task so behaviour is deterministic
function setProdEnv(done) {
  process.env.NODE_ENV = "production";
  done && done();
}

// Utility: Run a series of tasks in sequence (replaces Pipeline/Q)
async function runPipeline(entries, taskFn) {
  for (const entry of entries) {
    await new Promise((resolve, reject) => {
      const stream = taskFn(...entry);
      stream.on("end", resolve);
      stream.on("error", reject);
    });
  }
}

// Asset helpers

function addAllStyles(done) {
  const entries = styleEntries.map(([srcArr, outName]) =>
    gulp
      .src(srcArr)
      .pipe(plugins.plumber({ errorHandler: onError }))
      .pipe(useSourceMaps() ? plugins.sourcemaps.init() : noop())
      .pipe(sass())
      .pipe(plugins.concat(outName))
      .pipe(isProduction() ? plugins.cleanCss() : noop())
      .pipe(rev())
      .pipe(useSourceMaps() ? plugins.sourcemaps.write(".") : noop())
      .pipe(gulp.dest(config.cssOutDir))
  );
  return require("merge-stream")(...entries)
    .pipe(rev.manifest(config.cssManifestPath))
    .pipe(gulp.dest("."));
}

// ESM output (for <script type="module">)

function addAllScriptsESM() {
  const entries = scriptEntries.map(([srcArr, outName]) =>
    rollupStream({
      input: srcArr[0],
      plugins: [
        rollupReplace({
          preventAssignment: true,
          "process.env.NODE_ENV": JSON.stringify(
            isProduction() ? "production" : "development"
          ),
        }),
        rollupResolve({ browser: true }),
        rollupCommonjs(),
        rollupBabel({
          babelHelpers: "bundled",
          babelrc: false,
          exclude: "node_modules/**",
        }),
      ],
      output: {
        format: "esm",
        inlineDynamicImports: true,
      },
    })
      .pipe(source(outName))
      .pipe(buffer())
      .pipe(plugins.plumber({ errorHandler: onError }))
      .pipe(
        useSourceMaps() ? plugins.sourcemaps.init({ loadMaps: true }) : noop()
      )
      .pipe(isProduction() ? uglify() : noop())
      .pipe(isProduction() ? javascriptObfuscator() : noop())
      .pipe(rev())
      .pipe(useSourceMaps() ? plugins.sourcemaps.write(".") : noop())
      .pipe(gulp.dest(config.jsOutDir))
  );
  return require("merge-stream")(...entries)
    .pipe(rev.manifest(config.jsManifestPath))
    .pipe(gulp.dest("."));
}

// IIFE output (for <script nomodule>)
// Map entry names to IIFE global names (only libraries need a name, app entries don't)
const iifeNames = {
  "query_builder.js": "QueryBuilder", // Library bundle - expose as global
};

function addAllScriptsIIFE() {
  const entries = scriptEntries.map(([srcArr, outName]) => {
    const iifeOutName = outName.replace(/\.js$/, ".iife.js");
    return rollupStream({
      input: srcArr[0],
      plugins: [
        rollupReplace({
          preventAssignment: true,
          "process.env.NODE_ENV": JSON.stringify(
            isProduction() ? "production" : "development"
          ),
        }),
        rollupResolve({ browser: true }),
        rollupCommonjs(),
        rollupBabel({
          babelHelpers: "bundled",
          babelrc: false,
          exclude: "node_modules/**",
        }),
      ],
      output: {
        format: "iife",
        name: iifeNames[outName] || undefined,
        exports: "named",
        inlineDynamicImports: true,
      },
    })
      .pipe(source(iifeOutName))
      .pipe(buffer())
      .pipe(plugins.plumber({ errorHandler: onError }))
      .pipe(
        useSourceMaps() ? plugins.sourcemaps.init({ loadMaps: true }) : noop()
      )
      .pipe(isProduction() ? uglify() : noop())
      .pipe(isProduction() ? javascriptObfuscator() : noop())
      .pipe(rev())
      .pipe(useSourceMaps() ? plugins.sourcemaps.write(".") : noop())
      .pipe(gulp.dest(config.jsOutDir));
  });
  return require("merge-stream")(...entries)
    .pipe(rev.manifest(config.jsManifestPath, { merge: true }))
    .pipe(gulp.dest("."));
}

function onError(err) {
  console.error("[Error]", err.toString());
  if (this && typeof this.emit === "function") this.emit("end");
}

gulp.task("clean", async function () {});

// Clean output folders before each build
gulp.task("clean-js", async function () {
  await rimraf(config.jsOutDir + "/*", { glob: true });
});
gulp.task("clean-css", async function () {
  await rimraf(config.cssOutDir + "/*", { glob: true });
});
gulp.task("clean", async function () {
  await rimraf("dist/**", { glob: true });
});

const styleEntries = [
  [[config.libCssDir + "/main.scss"], "query-builder.css"],
  [[config.assetsCssDir + "/main.scss"], "main.css"],
];

const scriptEntries = [
  [[config.libJsDir + "/index.js"], "query-builder.js"],
  [[config.assetsJsDir + "/index.js"], "main.js"],
];

gulp.task("styles", gulp.series("clean-css", addAllStyles));

// Run cleanup after styles
gulp.task("styles-clean", gulp.series("styles", "clean-old-css"));

gulp.task(
  "scripts",
  gulp.series("clean-js", addAllScriptsESM, addAllScriptsIIFE)
);

// Run cleanup after scripts
gulp.task("scripts-clean", gulp.series("scripts", "clean-old-js"));

// Watch task

gulp.task("watch", function () {
  gulp.watch(
    [config.libCssDir + "/**/*.scss", config.assetsCssDir + "/**/*.scss"],
    gulp.series("styles-clean")
  );

  gulp.watch(
    [config.libJsDir + "/**/*.js", config.assetsJsDir + "/**/*.js"],
    gulp.series("scripts-clean")
  );
});

// Default and dev/prod tasks (must be last)
gulp.task(
  "dev_with_watch",
  gulp.series("clean", "styles-clean", "scripts-clean", "watch")
);

gulp.task("dev", gulp.series("clean", "styles-clean", "scripts-clean"));
// Prod task: set NODE_ENV and run the full clean/build without sourcemaps
gulp.task(
  "prod",
  gulp.series(setProdEnv, "clean", "styles-clean", "scripts-clean")
);

gulp.task("default", gulp.series("dev"));
