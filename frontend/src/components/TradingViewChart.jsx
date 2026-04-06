import { useEffect, useRef, memo } from 'react'
import { createDatafeed } from '../services/tvDatafeed'

const TradingViewChart = memo(({ symbol = 'XAUUSD', theme = 'dark', isMobile = false }) => {
  const containerRef = useRef(null)
  const widgetRef = useRef(null)

  useEffect(() => {
    if (!containerRef.current || !window.TradingView) return

    let cancelled = false

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

    return () => {
      cancelled = true
      if (widgetRef.current) {
        try { widgetRef.current.remove() } catch (e) {}
        widgetRef.current = null
      }
    }
  }, [symbol, theme, isMobile])

  return (
    <div
      ref={containerRef}
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
    />
  )
})

TradingViewChart.displayName = 'TradingViewChart'

export default TradingViewChart
