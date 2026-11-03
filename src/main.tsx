import { render } from 'preact'
import { initAnalytics } from './analytics'
import { library } from './state/library'
import { App } from './ui/App'
import { applyPlatform, enableRipples } from './ui/platform'
import './ui/styles/index.css'

applyPlatform()
enableRipples()
initAnalytics()
library.load()
render(<App />, document.getElementById('app')!)
