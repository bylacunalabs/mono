import { render } from 'preact'
import { library } from './state/library'
import { App } from './ui/App'
import './ui/styles.css'

library.load()
render(<App />, document.getElementById('app')!)
