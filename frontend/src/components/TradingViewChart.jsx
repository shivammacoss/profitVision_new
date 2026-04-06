import { useEffect, useRef, useState, memo } from 'react'
import { createDatafeed } from '../services/tvDatafeed'

// Module-level: track script load state to avoid duplicate <script> tags
let scriptStatus = 'idle' // 'idle' | 'loading' | 'loaded' | 'error'
const scriptCallbacks = []

function loadTVScript(onLoad, onError) {
  if (scriptStatus === 'loaded') { onLoad(); return }
  if (scriptStatus === 'error') { onError(); return }

  scriptCallbacks.push({ onLoad, onError })

  if (scriptStatus === 'loading') return

  scriptStatus = 'loading'
  const script = document.createElement('script')
  script.src = '/charting_library/charting_library.standalone.js'
  script.async = true
  script.onload = () => {
    scriptStatus = 'loaded'
    scriptCallbacks.forEach(cb => cb.onLoad())
    scriptCallbacks.length = 0
  }
  script.onerror = () => {
    scriptStatus = 'error'
    scriptCallbacks.forEach(cb => cb.onError())
    scriptCallbacks.length = 0
  }
  document.head.appendChild(script)
}

const TradingViewChart = memo(({ symbol = 'XAUUSD', theme = 'dark', isMobile = false }) => {
  const containerRef = useRef(null)
  const widgetRef = useRef(null)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    if (!containerRef.current) return

    let cancelled = false

    const initWidget = () => {
      if (cancelled || !containerRef.current || !window.TradingView) return

      if (widgetRef.current) {
        try { widgetRef.current.remove() } catch (e) {}
        widgetRef.current = null
      }

      const disabledFeatures = [
        'use_localstorage_for_settings',
        'header_symbol_search',
        'symbol_search_hot_key',
        'header_compare',
        'display_market_status',
      ]

      if (isMobile) {
        disabledFeatures.push(
          'left_toolbar',
          'header_fullscreen_button',
          'control_bar',
          'timeframes_toolbar',
        )
      }

      const widget = new window.TradingView.widget({
        container: containerRef.current,
        datafeed: createDatafeed(),
        library_path: '/charting_library/',
        locale: 'en',
        symbol: symbol,
        interval: '5',
        fullscreen: false,
        autosize: true,
        theme: theme === 'dark' ? 'dark' : 'light',
        style: '1',
        timezone: 'Etc/UTC',
        toolbar_bg: theme === 'dark' ? '#0d0d0d' : '#ffffff',
        loading_screen: {
          backgroundColor: theme === 'dark' ? '#0d0d0d' : '#ffffff',
          foregroundColor: '#2962FF',
        },
        disabled_features: disabledFeatures,
        enabled_features: [
          'study_templates',
          'hide_left_toolbar_by_default',
        ],
        overrides: {
          'paneProperties.background': theme === 'dark' ? '#0d0d0d' : '#ffffff',
          'paneProperties.backgroundType': 'solid',
          'mainSeriesProperties.candleStyle.upColor': '#26a69a',
          'mainSeriesProperties.candleStyle.downColor': '#ef5350',
          'mainSeriesProperties.candleStyle.wickUpColor': '#26a69a',
          'mainSeriesProperties.candleStyle.wickDownColor': '#ef5350',
          'mainSeriesProperties.candleStyle.borderUpColor': '#26a69a',
          'mainSeriesProperties.candleStyle.borderDownColor': '#ef5350',
        },
        studies_overrides: {},
        custom_css_url: '',
      })

      widgetRef.current = widget
    }

    loadTVScript(
      () => { if (!cancelled) initWidget() },
      () => { if (!cancelled) setLoadError(true) }
    )

    return () => {
      cancelled = true
      if (widgetRef.current) {
        try { widgetRef.current.remove() } catch (e) {}
        widgetRef.current = null
      }
    }
  }, [symbol, theme, isMobile])

  if (loadError) {
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: theme === 'dark' ? '#0d0d0d' : '#fff', color: '#888', fontSize: 14 }}>
        Chart library not found. Please contact support.
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%' }}
    />
  )
})

TradingViewChart.displayName = 'TradingViewChart'

export default TradingViewChart
