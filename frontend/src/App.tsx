import { useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { loadCart } from './cart/actions'
import { Layout } from './components/Layout'
import { localeStore } from './i18n'
import { MotionProvider } from './motion'
import { AboutPage } from './pages/AboutPage'
import { BookDetailPage } from './pages/BookDetailPage'
import { CatalogPage } from './pages/CatalogPage'
import { loadCatalog } from './stores/catalog'

export default function App() {
  useEffect(() => {
    document.documentElement.lang = localeStore.get()
    void loadCatalog()
    void loadCart()
    // Nothing voice-related starts here: a Live session opens only when the microphone is clicked.
  }, [])

  return (
    <MotionProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<CatalogPage />} />
            <Route path="/book/:olid" element={<BookDetailPage />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </MotionProvider>
  )
}
