import React from 'react'
import { DataManagerContext } from './DataManager.js'
import { formatConsumableData } from './utils.js'

export default function withData( dependenciesObject, settersObject ) {
    return function( WrappedComponent ) {
        class WithData extends React.PureComponent {
            constructor( props, context ) {
                super( props, context )
                this._id = `component_${Date.now()}__${Math.random()}`
                this._dependenciesKeys = Object.keys( dependenciesObject )
                this._setters = _formatSetters( settersObject, this.context.setStore )
            }
            componentWillMount() {
                this._dependenciesKeys.forEach( k => {
                    this.context.subscribe( this._id, dependenciesObject[ k ] )
                } )
            }
            componentWillUnmount() {
                this._dependenciesKeys.forEach( k => {
                    this.context.unsubscribe( this._id, dependenciesObject[ k ] )
                } )
            }
            render() {
                const  {
                    store,
                    status
                } = this.context
                const requestedData = formatConsumableData( dependenciesObject, store, status )
                return <WrappedComponent { ...this.props } { ...requestedData } { ...this._setters } />
            }
        }
        WithData.contextType = DataManagerContext
        return WithData
    }
}

function _formatSetters( settersObject, setStore ) {
    if ( !settersObject ) {
        return {}
    }
    let formattedSetters = {}
    Object.keys( settersObject ).forEach( k => {
        formattedSetters[ k ] = newStoreData => {
            setStore( newStoreData, settersObject[ k ] )
        }
    } )
    return formattedSetters
}
