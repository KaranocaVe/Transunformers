import { HeroUIProvider } from '@heroui/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { RouterProvider } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/router-devtools'
import { useTranslation } from 'react-i18next'

import { router } from '../router'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
    },
  },
})

const resolveLocale = (language?: string) => {
  if (!language) {
    return 'en-US'
  }
  return language.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US'
}

export function AppProviders() {
  const { i18n } = useTranslation()
  const locale = resolveLocale(i18n.resolvedLanguage)
  const showDevtools = import.meta.env.DEV

  return (
    <HeroUIProvider locale={locale}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
        {showDevtools ? (
          <>
            <ReactQueryDevtools initialIsOpen={false} />
            <TanStackRouterDevtools router={router} position="bottom-right" />
          </>
        ) : null}
      </QueryClientProvider>
    </HeroUIProvider>
  )
}
