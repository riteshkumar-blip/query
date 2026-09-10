import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { queryKey, sleep } from '@tanstack/query-test-utils'
import { MutationObserver, QueryClient } from '..'

describe('mutationObserver', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    vi.useFakeTimers()
    queryClient = new QueryClient()
    queryClient.mount()
  })

  afterEach(() => {
    queryClient.clear()
    vi.useRealTimers()
  })

  test('onUnsubscribe should not remove the current mutation observer if there is still a subscription', async () => {
    const mutation = new MutationObserver(queryClient, {
      mutationFn: (text: string) => sleep(20).then(() => text),
    })

    const subscription1Handler = vi.fn()
    const subscription2Handler = vi.fn()

    const unsubscribe1 = mutation.subscribe(subscription1Handler)
    const unsubscribe2 = mutation.subscribe(subscription2Handler)

    mutation.mutate('input')

    unsubscribe1()

    expect(subscription1Handler).toBeCalledTimes(1)
    expect(subscription2Handler).toBeCalledTimes(1)

    await vi.advanceTimersByTimeAsync(20)
    expect(subscription1Handler).toBeCalledTimes(1)
    expect(subscription2Handler).toBeCalledTimes(2)

    unsubscribe2()
  })

  test('unsubscribe should remove observer to trigger GC', async () => {
    const mutation = new MutationObserver(queryClient, {
      mutationFn: (text: string) => sleep(5).then(() => text),
      gcTime: 10,
    })

    const subscriptionHandler = vi.fn()

    const unsubscribe = mutation.subscribe(subscriptionHandler)

    mutation.mutate('input')

    await vi.advanceTimersByTimeAsync(5)
    expect(queryClient.getMutationCache().findAll()).toHaveLength(1)

    unsubscribe()

    await vi.advanceTimersByTimeAsync(10)
    expect(queryClient.getMutationCache().findAll()).toHaveLength(0)
  })

  test('reset should remove observer to trigger GC', async () => {
    const mutation = new MutationObserver(queryClient, {
      mutationFn: (text: string) => sleep(5).then(() => text),
      gcTime: 10,
    })

    const subscriptionHandler = vi.fn()

    const unsubscribe = mutation.subscribe(subscriptionHandler)

    mutation.mutate('input')

    await vi.advanceTimersByTimeAsync(5)
    expect(queryClient.getMutationCache().findAll()).toHaveLength(1)

    mutation.reset()

    await vi.advanceTimersByTimeAsync(10)
    expect(queryClient.getMutationCache().findAll()).toHaveLength(0)

    unsubscribe()
  })

  test('changing mutation keys should reset the observer', async () => {
    const key = queryKey()
    const mutation = new MutationObserver(queryClient, {
      mutationKey: [...key, '1'],
      mutationFn: (text: string) => sleep(5).then(() => text),
    })

    const subscriptionHandler = vi.fn()

    const unsubscribe = mutation.subscribe(subscriptionHandler)

    mutation.mutate('input')

    await vi.advanceTimersByTimeAsync(5)
    expect(mutation.getCurrentResult()).toMatchObject({
      status: 'success',
      data: 'input',
    })

    mutation.setOptions({
      mutationKey: [...key, '2'],
    })

    expect(mutation.getCurrentResult()).toMatchObject({
      status: 'idle',
    })

    unsubscribe()
  })

  test('changing mutation keys should not affect already existing mutations', async () => {
    const key = queryKey()
    const mutationObserver = new MutationObserver(queryClient, {
      mutationKey: [...key, '1'],
      mutationFn: (text: string) => sleep(5).then(() => text),
    })

    const subscriptionHandler = vi.fn()

    const unsubscribe = mutationObserver.subscribe(subscriptionHandler)

    mutationObserver.mutate('input')

    await vi.advanceTimersByTimeAsync(5)
    expect(
      queryClient.getMutationCache().find({ mutationKey: [...key, '1'] }),
    ).toMatchObject({
      options: { mutationKey: [...key, '1'] },
      state: {
        status: 'success',
        data: 'input',
      },
    })

    mutationObserver.setOptions({
      mutationKey: [...key, '2'],
    })

    expect(
      queryClient.getMutationCache().find({ mutationKey: [...key, '1'] }),
    ).toMatchObject({
      options: { mutationKey: [...key, '1'] },
      state: {
        status: 'success',
        data: 'input',
      },
    })

    unsubscribe()
  })

  test('changing mutation meta should not affect successful mutations', async () => {
    const mutationObserver = new MutationObserver(queryClient, {
      meta: { a: 1 },
      mutationFn: (text: string) => sleep(5).then(() => text),
    })

    const subscriptionHandler = vi.fn()

    const unsubscribe = mutationObserver.subscribe(subscriptionHandler)

    mutationObserver.mutate('input')

    await vi.advanceTimersByTimeAsync(5)
    expect(queryClient.getMutationCache().find({})).toMatchObject({
      options: { meta: { a: 1 } },
      state: {
        status: 'success',
        data: 'input',
      },
    })

    mutationObserver.setOptions({
      meta: { a: 2 },
    })

    expect(queryClient.getMutationCache().find({})).toMatchObject({
      options: { meta: { a: 1 } },
      state: {
        status: 'success',
        data: 'input',
      },
    })

    unsubscribe()
  })

  test('mutation cache should have different meta when updated between mutations', async () => {
    const mutationFn = (text: string) => sleep(5).then(() => text)
    const mutationObserver = new MutationObserver(queryClient, {
      meta: { a: 1 },
      mutationFn,
    })

    const subscriptionHandler = vi.fn()

    const unsubscribe = mutationObserver.subscribe(subscriptionHandler)

    mutationObserver.mutate('input')
    await vi.advanceTimersByTimeAsync(5)

    mutationObserver.setOptions({
      meta: { a: 2 },
      mutationFn,
    })

    mutationObserver.mutate('input')
    await vi.advanceTimersByTimeAsync(5)

    const mutations = queryClient.getMutationCache().findAll()
    expect(mutations[0]).toMatchObject({
      options: { meta: { a: 1 } },
      state: {
        status: 'success',
        data: 'input',
      },
    })
    expect(mutations[1]).toMatchObject({
      options: { meta: { a: 2 } },
      state: {
        status: 'success',
        data: 'input',
      },
    })

    unsubscribe()
  })

  test('changing mutation meta should not affect rejected mutations', async () => {
    const mutationObserver = new MutationObserver(queryClient, {
      meta: { a: 1 },
      mutationFn: (_: string) =>
        sleep(5).then(() => Promise.reject(new Error('err'))),
    })

    const subscriptionHandler = vi.fn()

    const unsubscribe = mutationObserver.subscribe(subscriptionHandler)

    mutationObserver.mutate('input').catch(() => undefined)

    await vi.advanceTimersByTimeAsync(5)
    expect(queryClient.getMutationCache().find({})).toMatchObject({
      options: { meta: { a: 1 } },
      state: {
        status: 'error',
      },
    })

    mutationObserver.setOptions({
      meta: { a: 2 },
    })

    expect(queryClient.getMutationCache().find({})).toMatchObject({
      options: { meta: { a: 1 } },
      state: {
        status: 'error',
      },
    })

    unsubscribe()
  })

  test('changing mutation meta should affect pending mutations', async () => {
    const mutationObserver = new MutationObserver(queryClient, {
      meta: { a: 1 },
      mutationFn: (text: string) => sleep(20).then(() => text),
    })

    const subscriptionHandler = vi.fn()

    const unsubscribe = mutationObserver.subscribe(subscriptionHandler)

    mutationObserver.mutate('input')
    await vi.advanceTimersByTimeAsync(5)
    expect(queryClient.getMutationCache().find({})).toMatchObject({
      options: { meta: { a: 1 } },
      state: {
        status: 'pending',
      },
    })

    mutationObserver.setOptions({
      meta: { a: 2 },
    })

    expect(queryClient.getMutationCache().find({})).toMatchObject({
      options: { meta: { a: 2 } },
      state: {
        status: 'pending',
      },
    })

    unsubscribe()
  })

  test('mutation callbacks should be called in correct order with correct arguments for success case', async () => {
    const onSuccess = vi.fn()
    const onSettled = vi.fn()

    const mutationObserver = new MutationObserver(queryClient, {
      mutationFn: (text: string) => Promise.resolve(text.toUpperCase()),
    })

    const subscriptionHandler = vi.fn()
    const unsubscribe = mutationObserver.subscribe(subscriptionHandler)

    mutationObserver.mutate('success', {
      onSuccess,
      onSettled,
    })

    await vi.advanceTimersByTimeAsync(0)

    expect(onSuccess).toHaveBeenCalledTimes(1)
    expect(onSuccess).toHaveBeenCalledWith('SUCCESS', 'success', undefined, {
      client: queryClient,
      meta: undefined,
      mutationKey: undefined,
    })
    expect(onSettled).toHaveBeenCalledTimes(1)
    expect(onSettled).toHaveBeenCalledWith(
      'SUCCESS',
      null,
      'success',
      undefined,
      {
        client: queryClient,
        meta: undefined,
        mutationKey: undefined,
      },
    )

    unsubscribe()
  })

  test('mutation callbacks should be called in correct order with correct arguments for error case', async () => {
    const onError = vi.fn()
    const onSettled = vi.fn()

    const error = new Error('error')
    const mutationObserver = new MutationObserver(queryClient, {
      mutationFn: (_: string) => Promise.reject(error),
    })

    const subscriptionHandler = vi.fn()
    const unsubscribe = mutationObserver.subscribe(subscriptionHandler)

    mutationObserver
      .mutate('error', {
        onError,
        onSettled,
      })
      .catch(() => {})

    await vi.advanceTimersByTimeAsync(0)

    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith(error, 'error', undefined, {
      client: queryClient,
      meta: undefined,
      mutationKey: undefined,
    })
    expect(onSettled).toHaveBeenCalledTimes(1)
    expect(onSettled).toHaveBeenCalledWith(
      undefined,
      error,
      'error',
      undefined,
      {
        client: queryClient,
        meta: undefined,
        mutationKey: undefined,
      },
    )

    unsubscribe()
  })

  describe('erroneous mutation callback', () => {
    test('onSuccess and onSettled is transferred to different execution context where it is reported', async ({
      onTestFinished,
    }) => {
      const unhandledRejectionFn = vi.fn()
      process.on('unhandledRejection', (error) => unhandledRejectionFn(error))
      onTestFinished(() => {
        process.off('unhandledRejection', unhandledRejectionFn)
      })

      const onSuccessError = new Error('onSuccess-error')
      const onSuccess = vi.fn(() => {
        throw onSuccessError
      })
      const onSettledError = new Error('onSettled-error')
      const onSettled = vi.fn(() => {
        throw onSettledError
      })

      const mutationObserver = new MutationObserver(queryClient, {
        mutationFn: (text: string) => Promise.resolve(text.toUpperCase()),
      })

      const subscriptionHandler = vi.fn()
      const unsubscribe = mutationObserver.subscribe(subscriptionHandler)

      mutationObserver.mutate('success', {
        onSuccess,
        onSettled,
      })

      await vi.advanceTimersByTimeAsync(0)

      expect(onSuccess).toHaveBeenCalledTimes(1)
      expect(onSettled).toHaveBeenCalledTimes(1)

      expect(unhandledRejectionFn).toHaveBeenCalledTimes(2)
      expect(unhandledRejectionFn).toHaveBeenNthCalledWith(1, onSuccessError)
      expect(unhandledRejectionFn).toHaveBeenNthCalledWith(2, onSettledError)

      expect(subscriptionHandler).toHaveBeenCalledTimes(2)

      unsubscribe()
    })

    test('onError and onSettled is transferred to different execution context where it is reported', async ({
      onTestFinished,
    }) => {
      const unhandledRejectionFn = vi.fn()
      process.on('unhandledRejection', (error) => unhandledRejectionFn(error))
      onTestFinished(() => {
        process.off('unhandledRejection', unhandledRejectionFn)
      })

      const onErrorError = new Error('onError-error')
      const onError = vi.fn(() => {
        throw onErrorError
      })
      const onSettledError = new Error('onSettled-error')
      const onSettled = vi.fn(() => {
        throw onSettledError
      })

      const error = new Error('error')
      const mutationObserver = new MutationObserver(queryClient, {
        mutationFn: (_: string) => Promise.reject(error),
      })

      const subscriptionHandler = vi.fn()
      const unsubscribe = mutationObserver.subscribe(subscriptionHandler)

      mutationObserver
        .mutate('error', {
          onError,
          onSettled,
        })
        .catch(() => {})

      await vi.advanceTimersByTimeAsync(0)

      expect(onError).toHaveBeenCalledTimes(1)
      expect(onSettled).toHaveBeenCalledTimes(1)

      expect(unhandledRejectionFn).toHaveBeenCalledTimes(2)
      expect(unhandledRejectionFn).toHaveBeenNthCalledWith(1, onErrorError)
      expect(unhandledRejectionFn).toHaveBeenNthCalledWith(2, onSettledError)

      expect(subscriptionHandler).toHaveBeenCalledTimes(2)

      unsubscribe()
    })

    test('onSuccess throw still runs onSettled and is transferred to different execution context without flipping success', async ({
      onTestFinished,
    }) => {
      const unhandledRejectionFn = vi.fn()
      process.on('unhandledRejection', (error) => unhandledRejectionFn(error))
      onTestFinished(() => {
        process.off('unhandledRejection', unhandledRejectionFn)
      })

      const onSuccessError = new Error('onSuccess-error')
      const onSettledError = new Error('onSettled-error')
      const onSuccess = vi.fn(() => {
        throw onSuccessError
      })
      const onSettled = vi.fn(() => {
        throw onSettledError
      })

      const mutationObserver = new MutationObserver(queryClient, {
        mutationFn: (text: string) => Promise.resolve(text.toUpperCase()),
      })
      const unsubscribe = mutationObserver.subscribe(vi.fn())

      mutationObserver.mutate('success', {
        onSuccess,
        onSettled,
      })

      await vi.advanceTimersByTimeAsync(0)

      expect(onSuccess).toHaveBeenCalledTimes(1)
      expect(onSettled).toHaveBeenCalledTimes(1)
      expect(unhandledRejectionFn).toHaveBeenCalledTimes(2)
      expect(unhandledRejectionFn).toHaveBeenNthCalledWith(1, onSuccessError)
      expect(unhandledRejectionFn).toHaveBeenNthCalledWith(2, onSettledError)
      expect(mutationObserver.getCurrentResult().isSuccess).toBe(true)
      expect(mutationObserver.getCurrentResult().error).toBeNull()

      unsubscribe()
    })

    test('onError throw still runs onSettled', async ({ onTestFinished }) => {
      const unhandledRejectionFn = vi.fn()
      process.on('unhandledRejection', (error) => unhandledRejectionFn(error))
      onTestFinished(() => {
        process.off('unhandledRejection', unhandledRejectionFn)
      })

      const onErrorError = new Error('onError-error')
      const onError = vi.fn(() => {
        throw onErrorError
      })
      const onSettled = vi.fn()

      const mutationObserver = new MutationObserver(queryClient, {
        mutationFn: (_: string) => Promise.reject(new Error('error')),
      })
      const unsubscribe = mutationObserver.subscribe(vi.fn())

      mutationObserver
        .mutate('error', {
          onError,
          onSettled,
        })
        .catch(() => {})

      await vi.advanceTimersByTimeAsync(0)

      expect(onError).toHaveBeenCalledTimes(1)
      expect(onSettled).toHaveBeenCalledTimes(1)
      expect(unhandledRejectionFn).toHaveBeenCalledTimes(1)
      expect(unhandledRejectionFn).toHaveBeenCalledWith(onErrorError)

      unsubscribe()
    })

    test('onSettled throw on success still ran onSuccess', async ({
      onTestFinished,
    }) => {
      const unhandledRejectionFn = vi.fn()
      process.on('unhandledRejection', (error) => unhandledRejectionFn(error))
      onTestFinished(() => {
        process.off('unhandledRejection', unhandledRejectionFn)
      })

      const onSettledError = new Error('onSettled-error')
      const onSuccess = vi.fn()
      const onSettled = vi.fn(() => {
        throw onSettledError
      })

      const mutationObserver = new MutationObserver(queryClient, {
        mutationFn: (text: string) => Promise.resolve(text.toUpperCase()),
      })
      const unsubscribe = mutationObserver.subscribe(vi.fn())

      mutationObserver.mutate('success', {
        onSuccess,
        onSettled,
      })

      await vi.advanceTimersByTimeAsync(0)

      expect(onSuccess).toHaveBeenCalledTimes(1)
      expect(onSettled).toHaveBeenCalledTimes(1)
      expect(unhandledRejectionFn).toHaveBeenCalledTimes(1)
      expect(unhandledRejectionFn).toHaveBeenCalledWith(onSettledError)

      unsubscribe()
    })

    test('onSettled throw on error still ran onError', async ({
      onTestFinished,
    }) => {
      const unhandledRejectionFn = vi.fn()
      process.on('unhandledRejection', (error) => unhandledRejectionFn(error))
      onTestFinished(() => {
        process.off('unhandledRejection', unhandledRejectionFn)
      })

      const onSettledError = new Error('onSettled-error')
      const onError = vi.fn()
      const onSettled = vi.fn(() => {
        throw onSettledError
      })

      const mutationObserver = new MutationObserver(queryClient, {
        mutationFn: (_: string) => Promise.reject(new Error('error')),
      })
      const unsubscribe = mutationObserver.subscribe(vi.fn())

      mutationObserver
        .mutate('error', {
          onError,
          onSettled,
        })
        .catch(() => {})

      await vi.advanceTimersByTimeAsync(0)

      expect(onError).toHaveBeenCalledTimes(1)
      expect(onSettled).toHaveBeenCalledTimes(1)
      expect(unhandledRejectionFn).toHaveBeenCalledTimes(1)
      expect(unhandledRejectionFn).toHaveBeenCalledWith(onSettledError)

      unsubscribe()
    })

    test('mutate() success onSuccess throw keeps result successful and still notifies listeners', async ({
      onTestFinished,
    }) => {
      const unhandledRejectionFn = vi.fn()
      process.on('unhandledRejection', (error) => unhandledRejectionFn(error))
      onTestFinished(() => {
        process.off('unhandledRejection', unhandledRejectionFn)
      })

      const onSuccessError = new Error('onSuccess-error')
      const onSuccess = vi.fn(() => {
        throw onSuccessError
      })
      const onSettled = vi.fn()
      const listener = vi.fn()

      const mutationObserver = new MutationObserver(queryClient, {
        mutationFn: (text: string) => Promise.resolve(text.toUpperCase()),
      })
      const unsubscribe = mutationObserver.subscribe(listener)

      const data = await mutationObserver.mutate('ok', {
        onSuccess,
        onSettled,
      })

      await vi.advanceTimersByTimeAsync(0)

      expect(data).toBe('OK')
      expect(onSuccess).toHaveBeenCalledTimes(1)
      expect(onSettled).toHaveBeenCalledTimes(1)
      expect(listener).toHaveBeenCalled()
      expect(mutationObserver.getCurrentResult().isSuccess).toBe(true)
      expect(mutationObserver.getCurrentResult().data).toBe('OK')
      expect(mutationObserver.getCurrentResult().error).toBeNull()
      expect(unhandledRejectionFn).toHaveBeenCalledTimes(1)
      expect(unhandledRejectionFn).toHaveBeenCalledWith(onSuccessError)

      unsubscribe()
    })

    test('mutate() success onSettled throw keeps result successful without flipping status', async ({
      onTestFinished,
    }) => {
      const unhandledRejectionFn = vi.fn()
      process.on('unhandledRejection', (error) => unhandledRejectionFn(error))
      onTestFinished(() => {
        process.off('unhandledRejection', unhandledRejectionFn)
      })

      const onSettledError = new Error('onSettled-error')
      const onSuccess = vi.fn()
      const onSettled = vi.fn(() => {
        throw onSettledError
      })

      const mutationObserver = new MutationObserver(queryClient, {
        mutationFn: (text: string) => Promise.resolve(text.toUpperCase()),
      })
      const unsubscribe = mutationObserver.subscribe(vi.fn())

      await mutationObserver.mutate('ok', {
        onSuccess,
        onSettled,
      })

      await vi.advanceTimersByTimeAsync(0)

      expect(onSuccess).toHaveBeenCalledTimes(1)
      expect(onSettled).toHaveBeenCalledTimes(1)
      expect(mutationObserver.getCurrentResult().status).toBe('success')
      expect(mutationObserver.getCurrentResult().isSuccess).toBe(true)
      expect(mutationObserver.getCurrentResult().error).toBeNull()
      expect(unhandledRejectionFn).toHaveBeenCalledTimes(1)
      expect(unhandledRejectionFn).toHaveBeenCalledWith(onSettledError)

      unsubscribe()
    })

    test('mutate() success both callbacks throw in order and leave mutation successful', async ({
      onTestFinished,
    }) => {
      const unhandledRejectionFn = vi.fn()
      process.on('unhandledRejection', (error) => unhandledRejectionFn(error))
      onTestFinished(() => {
        process.off('unhandledRejection', unhandledRejectionFn)
      })

      const onSuccessError = new Error('onSuccess-error')
      const onSettledError = new Error('onSettled-error')
      const results: Array<string> = []

      const mutationObserver = new MutationObserver(queryClient, {
        mutationFn: (text: string) => Promise.resolve(text.toUpperCase()),
      })
      const unsubscribe = mutationObserver.subscribe(vi.fn())

      await mutationObserver.mutate('ok', {
        onSuccess: () => {
          results.push('onSuccess')
          throw onSuccessError
        },
        onSettled: () => {
          results.push('onSettled')
          throw onSettledError
        },
      })

      await vi.advanceTimersByTimeAsync(0)

      expect(results).toEqual(['onSuccess', 'onSettled'])
      expect(mutationObserver.getCurrentResult().isSuccess).toBe(true)
      expect(mutationObserver.getCurrentResult().data).toBe('OK')
      expect(unhandledRejectionFn).toHaveBeenCalledTimes(2)
      expect(unhandledRejectionFn).toHaveBeenNthCalledWith(1, onSuccessError)
      expect(unhandledRejectionFn).toHaveBeenNthCalledWith(2, onSettledError)

      unsubscribe()
    })

    test('mutate() success onSuccess throw does not replace result data with callback error', async ({
      onTestFinished,
    }) => {
      const unhandledRejectionFn = vi.fn()
      process.on('unhandledRejection', (error) => unhandledRejectionFn(error))
      onTestFinished(() => {
        process.off('unhandledRejection', unhandledRejectionFn)
      })

      const onSuccessError = new Error('onSuccess-error')
      const mutationObserver = new MutationObserver(queryClient, {
        mutationFn: () => Promise.resolve({ id: 7 }),
      })
      const unsubscribe = mutationObserver.subscribe(vi.fn())

      await mutationObserver.mutate(undefined, {
        onSuccess: () => {
          throw onSuccessError
        },
        onSettled: () => {
          throw new Error('onSettled-error')
        },
      })

      await vi.advanceTimersByTimeAsync(0)

      expect(mutationObserver.getCurrentResult().isSuccess).toBe(true)
      expect(mutationObserver.getCurrentResult().data).toEqual({ id: 7 })
      expect(mutationObserver.getCurrentResult().error).toBeNull()
      expect(unhandledRejectionFn).toHaveBeenCalledTimes(2)

      unsubscribe()
    })

    test('mutate() success second mutate() callbacks stay isolated after prior callback throw', async ({
      onTestFinished,
    }) => {
      const unhandledRejectionFn = vi.fn()
      process.on('unhandledRejection', (error) => unhandledRejectionFn(error))
      onTestFinished(() => {
        process.off('unhandledRejection', unhandledRejectionFn)
      })

      const firstError = new Error('first-onSuccess')
      const secondSettled = vi.fn()

      const mutationObserver = new MutationObserver(queryClient, {
        mutationFn: (text: string) => Promise.resolve(text),
      })
      const unsubscribe = mutationObserver.subscribe(vi.fn())

      await mutationObserver.mutate('one', {
        onSuccess: () => {
          throw firstError
        },
        onSettled: () => {
          throw new Error('first-onSettled')
        },
      })

      await vi.advanceTimersByTimeAsync(0)

      await mutationObserver.mutate('two', {
        onSuccess: () => {
          // no-op
        },
        onSettled: secondSettled,
      })

      await vi.advanceTimersByTimeAsync(0)

      expect(secondSettled).toHaveBeenCalledTimes(1)
      expect(mutationObserver.getCurrentResult().data).toBe('two')
      expect(mutationObserver.getCurrentResult().isSuccess).toBe(true)
      expect(unhandledRejectionFn).toHaveBeenCalledWith(firstError)

      unsubscribe()
    })

    test('mutate() success onSettled throw still ran onSuccess without flipping success', async ({
      onTestFinished,
    }) => {
      const unhandledRejectionFn = vi.fn()
      process.on('unhandledRejection', (error) => unhandledRejectionFn(error))
      onTestFinished(() => {
        process.off('unhandledRejection', unhandledRejectionFn)
      })

      const onSettledError = new Error('onSettled-error')
      const onSuccess = vi.fn()
      const onSettled = vi.fn(() => {
        throw onSettledError
      })

      const mutationObserver = new MutationObserver(queryClient, {
        mutationFn: (text: string) => Promise.resolve(text.toUpperCase()),
      })
      const unsubscribe = mutationObserver.subscribe(vi.fn())

      await mutationObserver.mutate('ok', {
        onSuccess,
        onSettled,
      })

      await vi.advanceTimersByTimeAsync(0)

      expect(onSuccess).toHaveBeenCalledTimes(1)
      expect(onSettled).toHaveBeenCalledTimes(1)
      expect(mutationObserver.getCurrentResult().isSuccess).toBe(true)
      expect(unhandledRejectionFn).toHaveBeenCalledWith(onSettledError)

      unsubscribe()
    })

    test('mutate() success returned rejection keeps result successful and still runs onSettled', async ({
      onTestFinished,
    }) => {
      const unhandledRejectionFn = vi.fn()
      process.on('unhandledRejection', (error) => unhandledRejectionFn(error))
      onTestFinished(() => {
        process.off('unhandledRejection', unhandledRejectionFn)
      })

      const onSuccessError = new Error('onSuccess-reject')
      const onSuccess = vi.fn(() => Promise.reject(onSuccessError))
      const onSettled = vi.fn()

      const mutationObserver = new MutationObserver(queryClient, {
        mutationFn: (text: string) => Promise.resolve(text.toUpperCase()),
      })
      const unsubscribe = mutationObserver.subscribe(vi.fn())

      await mutationObserver.mutate('ok', {
        onSuccess,
        onSettled,
      })

      await vi.advanceTimersByTimeAsync(0)

      expect(onSuccess).toHaveBeenCalledTimes(1)
      expect(onSettled).toHaveBeenCalledTimes(1)
      expect(mutationObserver.getCurrentResult().isSuccess).toBe(true)
      expect(mutationObserver.getCurrentResult().data).toBe('OK')
      expect(unhandledRejectionFn).toHaveBeenCalledWith(onSuccessError)

      unsubscribe()
    })

    test('mutate() success async onSuccess throw keeps success without flipping and still runs onSettled', async ({
      onTestFinished,
    }) => {
      const unhandledRejectionFn = vi.fn()
      process.on('unhandledRejection', (error) => unhandledRejectionFn(error))
      onTestFinished(() => {
        process.off('unhandledRejection', unhandledRejectionFn)
      })

      const onSuccessError = new Error('async-onSuccess')
      const onSettledError = new Error('async-onSettled')
      const results: Array<string> = []

      const mutationObserver = new MutationObserver(queryClient, {
        mutationFn: (text: string) => Promise.resolve(text.toUpperCase()),
      })
      const unsubscribe = mutationObserver.subscribe(vi.fn())

      await mutationObserver.mutate('ok', {
        onSuccess: async () => {
          results.push('onSuccess-start')
          await Promise.resolve()
          results.push('onSuccess-throw')
          throw onSuccessError
        },
        onSettled: async () => {
          results.push('onSettled-start')
          await Promise.resolve()
          results.push('onSettled-throw')
          throw onSettledError
        },
      })

      await vi.advanceTimersByTimeAsync(0)

      expect(results).toEqual([
        'onSuccess-start',
        'onSettled-start',
        'onSuccess-throw',
        'onSettled-throw',
      ])
      expect(mutationObserver.getCurrentResult().isSuccess).toBe(true)
      expect(mutationObserver.getCurrentResult().error).toBeNull()
      expect(unhandledRejectionFn).toHaveBeenCalledWith(onSuccessError)
      expect(unhandledRejectionFn).toHaveBeenCalledWith(onSettledError)

      unsubscribe()
    })

    test('options onSuccess failure then mutate() onError throw preserves options error and still runs mutate onSettled', async ({
      onTestFinished,
    }) => {
      const unhandledRejectionFn = vi.fn()
      process.on('unhandledRejection', (error) => unhandledRejectionFn(error))
      onTestFinished(() => {
        process.off('unhandledRejection', unhandledRejectionFn)
      })

      const optionsSuccessError = new Error('options-onSuccess')
      const mutateErrorError = new Error('mutate-onError')

      const mutationObserver = new MutationObserver(queryClient, {
        mutationFn: () => Promise.resolve('data'),
        onSuccess: () => {
          throw optionsSuccessError
        },
      })
      const unsubscribe = mutationObserver.subscribe(vi.fn())
      const onSettled = vi.fn()

      await mutationObserver
        .mutate(undefined, {
          onError: () => {
            throw mutateErrorError
          },
          onSettled,
        })
        .catch(() => {})

      await vi.advanceTimersByTimeAsync(0)

      expect(onSettled).toHaveBeenCalledTimes(1)
      expect(mutationObserver.getCurrentResult().isError).toBe(true)
      expect(mutationObserver.getCurrentResult().error).toEqual(
        optionsSuccessError,
      )
      expect(unhandledRejectionFn).toHaveBeenCalledWith(mutateErrorError)

      unsubscribe()
    })
  })
})
