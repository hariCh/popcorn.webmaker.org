/*global cat,cd,cp,echo,env,exec,exit,find,mkdir,mv,pwd,rm,sed,target*/

var path = require( "path" ),
    spawn = require('child_process').spawn,
    normalize = function( p ){ return '"' + path.normalize( p ) + '"'; },
    join = path.join,
    // Make Windows happy, use `node <path>`
    nodeExec = function( p ){ return 'node "' + p + '"'; },
    pythonExec = function( p ){ return 'python "' + p + '"'; },
    SLICE = Array.prototype.slice,

    JSLINT = nodeExec( normalize( "./node_modules/jshint/bin/hint" ) ),
    HTML5LINT = pythonExec( normalize( "./external/html5-lint/html5check.py" ) ),
    CSSLINT = nodeExec( normalize( "./node_modules/csslint/cli.js" ) ),
    UGLIFY = nodeExec( normalize( "./node_modules/uglify-js/bin/uglifyjs" ) ),
    RJS = nodeExec( normalize( "./node_modules/requirejs/bin/r.js" ) ),
    LESS = nodeExec( normalize( "./node_modules/less/bin/lessc" ) ),

    SRC_DIR = 'src',
    TEMPLATES_DIR = 'templates',
    DIST_DIR = 'dist',
    CSS_DIR = 'css',
    CORNFIELD_DIR = 'cornfield',
    PUBLIC_DIR = 'public',

    DEFAULT_CONFIG = './src/default-config',

    BUTTER_LESS_FILE = join( CSS_DIR, "butter.ui.less" ),
    BUTTER_CSS_FILE_COMMENT = "/* THIS FILE WAS GENERATED BY A TOOL, DO NOT EDIT. SEE .less FILE IN css/ */",
    BUTTER_CSS_FILE = join( CSS_DIR, "/butter.ui.css" ),
    BUTTER_TRANSITIONS_LESS_FILE = join( CSS_DIR, "transitions.less" ),
    BUTTER_TRANSITIONS_CSS_FILE = join( CSS_DIR, "/transitions.css" ),

    BUTTERED_POPCORN = join( DIST_DIR, '/buttered-popcorn.js' ),

    // We store version info about Popcorn and Butter when we deploy
    VERSIONS_CONFIG = join( CORNFIELD_DIR, 'config', 'versions.json' ),

    // Global var for exit code
    passed = true;

require('shelljs/make');

// Get the git repo version info for a given repo root dir
function gitDescribe( repoRoot ) {
  var cwd = pwd();
  cd( repoRoot );
  var version = exec( 'git describe',
                      { silent: true } ).output.replace( /\r?\n/m, '' );
  cd( cwd );
  return version;
}

// Write a version.json file for cornfield to use when saving data
function publishVersionInfo( versionConfig ) {
  var defaultConfig = require( DEFAULT_CONFIG ),
      popcornDir = defaultConfig.dirs[ 'popcorn-js' ].replace( '{{baseDir}}', './' ),
      butterDir = '.';

  JSON.stringify({
    date: (new Date()).toJSON(),
    version: env.VERSION || 'development',
    popcorn: gitDescribe( popcornDir ),
    butter: gitDescribe( butterDir )
  }, null, 2 ).to( versionConfig );
}

// To supress CSS warnings/errors for a particular line, end the line
// with a comment indicating you want CSS Lint to ignore this line's
// error(s).  Here are some examples:
//
//   -webkit-appearance: button; /* csslint-ignore */
//   -webkit-appearance: button; /*csslint-ignore*/
//   -webkit-appearance: button; /* csslint-ignore: This is being done because of iOS ... */
function checkCSSFile( filename, warnings, errors ) {
  var fileLines = cat( filename ).split( /\r?\n/ ),
    ignoreLines = "",
    // Look for: "blah blah blah /* csslint-ignore */" or
    //           "blah blah /*csslint-ignore: this is my reason*/"
    ignoreRegex = /\/\*\s*csslint-ignore[^*]*\*\/$/,
    // Errors look like: "css/butter.ui.css: line 186, col 3, Error..."
    lineRegex = /\: line (\d+),/;

  echo( "## `" + filename + "`" );

  // Build a map of lines to ignore: "|14||27|" means ignore lines 14 and 27
  for( var i=0; i < fileLines.length; i++ ){
    if( ignoreRegex.test( fileLines[ i ] ) ) {
      ignoreLines += "|" + i + "|";
    }
  }

  // Run CSSLint across the file, check for errors/warnings and ignore if
  // they are ones we know about from above.
  exec(CSSLINT +
    ' --warnings=' + warnings +
    ' --errors=' + errors +
    ' --quiet --format=compact' +
    ' ' + filename, { silent: true } ).output.split( /\r?\n/ )
    .forEach( function( line ) {
      if( !line ) {
        return;
      }

      // Some warnings don't refer to a line, e.g.
      // "css/butter.ui.css: Warning - Too many floats (10)..."
      var matches = line.match( lineRegex ),
        lineNumber = matches ? matches[ 1 ] : null;

      if( !!lineNumber ) {
        if( ignoreLines.indexOf( "|" + lineNumber + "|" ) === -1 ) {
          echo( line );
          passed = false;
        }
      } else {
        echo( line );
        passed = false;
      }
  });
}

function checkCSS() {
  // see cli.js --list-rules.
  var warnings = [
//    "important",
//    "adjoining-classes",
//    "duplicate-background-images",
//    "qualified-headings",
//    "fallback-colors",
//    "empty-rules",
//    "shorthand",
//    "overqualified-elements",
//    "import",
//    "regex-selectors",
//    "rules-count",
//    "font-sizes",
//    "universal-selector",
//    "unqualified-attributes",
    "zero-units"
  ].join(",");

  var errors = [
    "known-properties",
    "compatible-vendor-prefixes",
    "display-property-grouping",
    "duplicate-properties",
    "errors",
    "gradients",
    "font-faces",
    //"floats",
    "vendor-prefix"
  ].join(",");

  echo( "" );
  echo( "# Linting CSS files" );

  find( SLICE.call( arguments ) ).filter(function( filename ) {
    return (/\.css$/).test( filename );
  }).forEach(function( filename ) {
    checkCSSFile( filename, warnings, errors );
  });

}

function checkJS(){
  // Takes a string or an array of strings referring to directories.
  var dirs = SLICE.call( arguments );

  echo( "# Linting JS files" );
  dirs.forEach( function( value ) {
    echo( "## `" + value + "`" );
  });

  // Get all js and json files in dirs
  var files = "";
  [ /\.js$/, /\.json$/ ].forEach( function( regexp ){
    files += find( dirs ).filter( function( file ) {
        return file.match( regexp );
      }).join(' ') + ' ';
  });

  // jshint with non-errors plus linting of json files
  passed = !exec( JSLINT + " " + files + " --extra-ext json" ).code && passed;
}

var desc = {
  check: 'Lint CSS, HTML, and JS',
  css: 'Build LESS files to CSS',
  deploy: 'Build Butter suitable for production',
  server: 'Run the development server'
};

target.all = function() {
  echo('Please specify a target. Available targets:');
  Object.keys(target).sort().filter(function(t) {
    return t !== "all";
  }).forEach(function(t) {
    echo('  ' + t + ' - ' + desc[t]);
  });
};

function clean() {
  rm('-fr', DIST_DIR);
  mkdir('-p', DIST_DIR);
}

function checkHTMLFile( filename, ignoreList ) {
  var printedHeader = false,
    printFooter = false;

  echo( "## `" + filename + "`" );

  var out = exec( HTML5LINT + " -h " + filename, { silent: true } ).output;

  if ( out ) {
    out = out.replace( "There were errors. (Tried in the text/html mode.)\n", "", "m" );

    // Break the set of errors apart, and inspect each for
    // matches in our ignoreList.  If not something we should
    // ignore, print each error.
    out.split( "\n\n" ).forEach( function( error ) {
      if ( !error.length ) {
        return;
      }
      var i = ignoreList.length,
        ignore;
      while ( i-- ) {
        ignore = ignoreList[ i ];
        // If the error string matches the ignore string, make sure
        // there isn't also a conditional when() function.  If there is
        // check that too.
        if ( error.indexOf( ignore.text ) > -1 ) {
          if ( ignore.when ) {
            if ( ignore.when( filename ) ) {
              return;
            }
          } else {
            return;
          }
        }
      }
      if ( !printedHeader ) {
        echo( "HTML5 Lint Issues for file: " + filename + "\n" );
        printedHeader = true;
        printFooter = true;
      }
      echo( error + "\n" );
    });

    if ( printFooter ) {
      echo( "\n" );
      passed = false;
    }
  }
}

function checkHTML() {
  // Poor-man's HTML Doc vs. Fragment check
  function isHTMLFragment( filename ) {
    return !( /<html[^>]*\>/m ).test( cat( filename ) );
  }

  // List of errors/warnings to ignore, some with a conditional
  // to only ignore when some condition is true.
  var ignoreList = [
    {
      // Don't warn on valid docs
      text: "The document is valid HTML5 + ARIA + SVG 1.1 + MathML 2.0 (subject to the utter previewness of this service)."
    },
    {
      text: "Error: Start tag seen without seeing a doctype first. Expected “<!DOCTYPE html>”.",
      when: isHTMLFragment
    },
    {
      text: "Error: Element “head” is missing a required instance of child element “title”.",
      when: isHTMLFragment
    },
    {
      text: "Error: Bad value “X-UA-Compatible” for attribute “http-equiv” on element “meta”."
    },
    {
      text: "Warning: The character encoding of the document was not declared."
    },
    {
      text: "Attribute “mozallowfullscreen” not allowed on element “iframe” at this point."
    },
    {
      text: "Attribute “webkitallowfullscreen” not allowed on element “iframe” at this point."
    },
    {
      text: "Attribute “allowfullscreen” not allowed on element “iframe” at this point."
    },
    {
      // Let <style> be in fragments.
      text: "Error: Element “style” not allowed as child of element “body” in this context. (Suppressing further errors from this subtree.)",
      when: isHTMLFragment
    },
    {
      // Let <li> be in fragments.
      text: "Error: Element “li” not allowed as child of element “body” in this context. (Suppressing further errors from this subtree.)",
      when: isHTMLFragment
    }
  ];

  echo( "" );
  echo( "# Linting HTML Files" );

  find([
    PUBLIC_DIR,
    join( SRC_DIR, "dialog", "dialogs" ),
    join( SRC_DIR, "layouts" ),
    join( SRC_DIR, "editor" ),
    join( SRC_DIR, "ui", "webmakernav" ),
    TEMPLATES_DIR ] ).filter( function( file ) {
    return file.match( /\.html$/ );
  }).forEach( function( filename ) {
    checkHTMLFile( filename, ignoreList );
  });
}

function lessToCSS( options ){
  var compress = !!options.compress,
      lessFile = options.lessFile,
      cssFile = options.cssFile;

  echo( "## `" + lessFile + "` => `" + cssFile + "`" + ( compress ? " with compression" : "" ));

  var args = compress ? " --yui-compress " : " ",
  result = exec(LESS + args + lessFile, {silent:true});

  if( result.code === 0 ){
    var css = BUTTER_CSS_FILE_COMMENT + "\n\n" + result.output;
    css.to( cssFile );
  } else {
    echo( result.output );
    passed = false;
  }
}

function buildCSS(compress) {
  echo( "" );
  echo( "# Compiling CSS Files" );

  lessToCSS({
    lessFile: BUTTER_LESS_FILE,
    cssFile: BUTTER_CSS_FILE,
    compress: compress
  });

  lessToCSS({
    lessFile: BUTTER_TRANSITIONS_LESS_FILE,
    cssFile: BUTTER_TRANSITIONS_CSS_FILE,
    compress: compress
  });

  lessToCSS({
    lessFile: "templates/basic/style.less",
    cssFile: "templates/basic/style.css",
    compress: compress
  });

  lessToCSS({
    lessFile: "templates/assets/plugins/wikipedia/popcorn.wikipedia.less",
    cssFile: "templates/assets/plugins/wikipedia/popcorn.wikipedia.css",
    compress: compress
  });

  lessToCSS({
    lessFile: "templates/assets/plugins/twitter/popcorn.twitter.less",
    cssFile: "templates/assets/plugins/twitter/popcorn.twitter.css",
    compress: compress
  });

  lessToCSS({
    lessFile: "templates/assets/css/jquery-ui/jquery.ui.butter.less",
    cssFile: "templates/assets/css/jquery-ui/jquery.ui.butter.css",
    compress: compress
  });

  lessToCSS({
    lessFile: "src/ui/webmakernav/webmakernav.less",
    cssFile: "src/ui/webmakernav/webmakernav.css",
    compress: compress
  });

  lessToCSS({
    lessFile: "css/embed.less",
    cssFile: "css/embed.css",
    compress: compress
  });

  lessToCSS({
    lessFile: "css/embed-shell.less",
    cssFile: "css/embed-shell.css",
    compress: compress
  });

}

target.check = function() {
  checkJS( 'make.js', SRC_DIR, CORNFIELD_DIR, TEMPLATES_DIR );
  buildCSS();
  checkCSS( 'css', 'public', 'src', 'templates' );
  checkHTML();

  exit( passed ? 0 : 1 );
};

function stampVersion( version, filename ){
  // Stamp embed.version with supplied version, or git info
  version = version || gitDescribe( "." );
  sed( '-i', /@VERSION@/g, version, filename );
}

target.css = function() {
  buildCSS();
};

function buildJS( version, compress ){
  var doCompress = compress ? "" : "optimize=none";
  var result = "";

  result = exec(RJS + ' -o tools/build.js ' + doCompress, {silent: true});
  if (!!result.code) {
    echo(result.output);
  }
  stampVersion( version, 'dist/src/butter.js' );

  result = exec(RJS + ' -o tools/embed.js ' + doCompress, {silent: true});
  if (!!result.code) {
    echo(result.output);
  }
  stampVersion( version, 'dist/src/embed.js' );

  result = exec(RJS + ' -o tools/webmakernav.js ' + doCompress, {silent: true});
  if (!!result.code) {
    echo(result.output);
  }
}

target.server = function() {
  echo('### Serving butter');

  // Write-out version info regarding Butter and Popcorn so cornfield knows what it's serving.
  publishVersionInfo( VERSIONS_CONFIG );

  cd( CORNFIELD_DIR );

  // Use child_process.spawn here for a long-running server process
  // (replaces `exec('node app.js', { async: true });`).
  var server = spawn( 'node', [ 'app.js' ] );

  // Mostly stolen from http://nodejs.org/docs/v0.3.5/api/child_processes.html#child_process.spawn
  server.stdout.on( 'data', function( data ) {
    process.stdout.write( data );
  });

  server.stderr.on( 'data', function( data ) {
    process.stderr.write( "" + data );
  });

  server.on( 'exit', function( code ) {
    console.log( 'server process exited with code ' + code );
  });
};

function butteredPopcorn() {
  var defaultConfig = require( DEFAULT_CONFIG ),
      popcornDir = defaultConfig.dirs['popcorn-js'].replace( '{{baseDir}}', './' ),
      popcornFiles = [];

  // Popcorn License Header
  popcornFiles.push( popcornDir + '/LICENSE_HEADER' );

  // classList shim
  popcornFiles.push( './tools/classlist-shim.js' );

  // popcorn IE8 shim
  popcornFiles.push( popcornDir + '/ie8/popcorn.ie8.js' );

  // popcorn.js
  popcornFiles.push( popcornDir + '/popcorn.js' );

  // plugins
  if ( defaultConfig.plugin && defaultConfig.plugin.plugins ) {
    defaultConfig.plugin.plugins.forEach( function( plugin ){
      popcornFiles.push( plugin.path.replace( '{{baseDir}}', './' ) );
    });
  }

  // wrapper base prototype
  popcornFiles.push( popcornDir + '/wrappers/common/popcorn._MediaElementProto.js' );

  // wrappers
  if ( defaultConfig.wrapper && defaultConfig.wrapper.wrappers ) {
    defaultConfig.wrapper.wrappers.forEach( function( wrapper ){
      popcornFiles.push( wrapper.path.replace( '{{baseDir}}', './' ) );
    });
  }

  // module for baseplayer
  popcornFiles.push( popcornDir + '/modules/player/popcorn.player.js' );

  // players
  if ( defaultConfig.player && defaultConfig.player.players ) {
    defaultConfig.player.players.forEach( function( player ){
      popcornFiles.push( player.path.replace( '{{baseDir}}', './' ) );
    });
  }

  // Stamp Popcorn.version with the git commit sha we are using
  var popcornVersion = gitDescribe( popcornDir );

  // Write out dist/buttered-popcorn.js
  cat( popcornFiles ).to( BUTTERED_POPCORN );
  sed('-i', /@VERSION/g, popcornVersion, BUTTERED_POPCORN);
}

target.deploy = function(){
  echo('### Making deployable versions of butter, embed, popcorn, etc. in dist/ (use UNMINIFIED=1 for unminified)');

  // To get unminified butter.js, use the UNMINIFIED env variable:
  // $ UNMINIFIED=1 node make deploy
  var compress = env.UNMINIFIED !== "1",
      version = env.VERSION;

  clean();

  buildCSS( compress );
  buildJS( version, compress );
  butteredPopcorn();

  // We'll mirror src/butter.js and src/embed.js to mimic exploded install
  mkdir('-p', './dist/src');

  // Copy other assets over
  mkdir( join( DIST_DIR, 'css' ) );
  cp('css/*.css', join( DIST_DIR, 'css' ) );
  cp('-R', 'resources', DIST_DIR);
  cp('-R', 'templates', DIST_DIR);
  cp('-R', 'cornfield', DIST_DIR);
  cp('package.json', 'README.md', DIST_DIR);

  // Export will need a version of popcorn.js where the templates expect it
  // at dist/external/popcorn-js/popcorn.js
  if ( compress ) {
    exec( UGLIFY + ' --output ' + BUTTERED_POPCORN + ' ' + BUTTERED_POPCORN );
  }
  mkdir( '-p', 'dist/external/popcorn-js/' );
  mv( BUTTERED_POPCORN, './dist/external/popcorn-js/popcorn.js' );

  // We host our own version of the stamen map tile script, copy that over.
  mkdir( '-p', 'dist/external/stamen/' );
  cp( 'external/stamen/tile.stamen-1.2.0.js', './dist/external/stamen' );

  // Move everything into the public folder
  cp( '-R', 'public', DIST_DIR );
  mv([ 'dist/css', 'dist/external', 'dist/resources', 'dist/src', 'dist/templates' ], 'dist/public/' );

  // Write-out version info regarding Butter and Popcorn so cornfield knows what it's serving.
  publishVersionInfo( join( DIST_DIR, VERSIONS_CONFIG ) );

  // Copy RPM spec files and stamp with version
  var rpmVersion = ( version ? version : gitDescribe( '.' ) ).replace( /-/g, '_' );
  cp( 'tools/rpmspec/*', DIST_DIR );
  stampVersion( rpmVersion, 'dist/butter.spec' );

  // Add a rev.txt file that's web-accessible
  gitDescribe( '.' ).to('dist/public/rev.txt');

  // Create a tar archive
  var tarName = 'butter-' + rpmVersion + '.tar.bz2';
  exec( 'tar -cjf "' + tarName + '" dist' );
  mv( tarName, 'dist' );

  // It's important to use the production config
  echo( 'Run cornfield with `NODE_ENV=production node app.js`' );
};
