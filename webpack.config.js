const path = require( 'path' )

module.exports = {
    mode: 'production',
    entry: './src/index.js',
    output: {
        path: path.resolve( 'dist' ),
        filename: 'index.js',
        libraryTarget: 'commonjs2'
    },
    externals: {
        react: 'react'
    },
    module: {
        rules: [
            {
                test: /\.js?$/,
                exclude: /(node_modules)/,
                use: {
                    loader: 'babel-loader'
                },
            }
        ]
    },
    resolve: {
        extensions: [ '.js' ]
    }
}
