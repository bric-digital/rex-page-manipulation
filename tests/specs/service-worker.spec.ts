// @ts-nocheck

import { test, expect } from './fixtures.js';

test.describe('REX Page Manipulation', () => {
  test('Service worker test: Set identifier', async ({serviceWorker}) => {
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        return new Promise<any>((testResolve) => {
          serviceWorker.evaluate(async () => {
            return new Promise<any>((testResolve) => {
              self.rexCorePlugin.handleMessage({
                'messageType': 'setIdentifier',
                'identifier': 'i-am-rex'
              }, this, (response:any) => {
                testResolve('i-am-rex')
              })
            })
          })
          .then((workerResponse) => {
            expect(workerResponse).toEqual('i-am-rex')

            resolve()
          })
        })
      }, 2500)
    })
  })
})