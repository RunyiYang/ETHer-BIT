import { ETHER_ADDRESS, ether, tokens, EVM_REVERT } from './helpers';

const { result } = require('lodash');

const Token = artifacts.require("./Token");
const Exchange = artifacts.require("./Exchange");

require('chai')
    .use(require('chai-as-promised'))
    .should()

contract('Exchange', ([deployer, feeAccount, user1, user2]) => {
    let token
    let exchange
    const feePercent = 10

    beforeEach(async () => {
        token = await Token.new() // Deploy token
        token.transfer(user1, tokens(100), { from: deployer }) // Transfer 100 tokens to user1

        exchange = await Exchange.new(feeAccount, feePercent) // Deploy exchange
    })

    describe('deployment', () => {

        it('tracks the fee account', async () => {
            const result = await exchange.feeAccount()
            result.should.equal(feeAccount)
        })

        it('tracks the fee percent', async () => {
            const result = await exchange.feePercent()
            result.toString().should.equal(feePercent.toString())
        })

    })

    describe('fallback', () => {
        it('reverts when Ether is sent', async () => {
            await exchange.sendTransaction({ value: 1, from: user1 }).should.be.rejected
        })
    })

    describe('depositing Ether', async () => {
        let result
        let amount

        beforeEach(async () => {
            amount = ether(1)
            result = await exchange.depositEther({ from: user1, value: amount })
        })

        it('tracks ether deposit', async () => {
            const balance = await exchange.tokens(ETHER_ADDRESS, user1)
            balance.toString().should.equal(amount.toString())
        })

        it('emits a deposit event', async () => {
            const log = result.logs[0]
            log.event.should.eq('Deposit')

            const event = log.args

            event.token.should.equal(ETHER_ADDRESS, 'token address is correct')
            event.user.should.equal(user1, 'user address is correct')
            event.amount.toString().should.equal(amount.toString(), 'amount is correct')
            event.balance.toString().should.equal(amount.toString(), 'balance is correct')
        })
    })

    describe('withdrawing Ether', async () => {
        let result
        let amount = ether(1)

        beforeEach(async () => {
            // Deposit Ether first
            await exchange.depositEther({ from: user1, value: amount })
        })

        describe('success', async () => {
            beforeEach(async () => {
                // Withdraw Ether
                result = await exchange.withdrawEther(amount, { from: user1 })
            })

            it('withdraws Ether funds', async () => {
                const balance = await exchange.tokens(ETHER_ADDRESS, user1)
                balance.toString().should.equal('0')
            })

            it('emits a "Withdraw" event', async () => {
                const log = result.logs[0]
                log.event.should.eq('Withdraw')

                const event = log.args

                event.token.should.equal(ETHER_ADDRESS)
                event.user.should.equal(user1)
                event.amount.toString().should.equal(amount.toString())
                event.balance.toString().should.equal('0')
            })
        })

        describe('failure', async () => {
            it('rejects withdraws for insufficient balances', async () => {
                await exchange.withdrawEther(ether(100), { from: user1 }).should.be.rejected
            })
        })
    })

    

    describe('checking balances', async () => {
        beforeEach(async () => {
            await exchange.depositEther({ from: user1, value: ether(1) })
        })

        it('returns user balance', async () => {
            const result = await exchange.balanceOf(ETHER_ADDRESS, user1)
            result.toString().should.equal(ether(1).toString())
        })
    })

    describe('making orders', async () => {
        let result

        beforeEach(async () => {
            result = await exchange.makeOrder(token.address, tokens(1), ETHER_ADDRESS, ether(1), { from: user1 })
        })

        it('tracks the newly created order', async () => {
            const orderCount = await exchange.orderCount()
            orderCount.toString().should.equal('1')

            const order = await exchange.orders('1')
            order.id.toString().should.equal('1', 'id is correct')
            order.user.should.equal(user1, 'user is correct')
            order.tokenGet.should.equal(token.address, 'tokenGet is corect')
            order.amountGet.toString().should.equal(tokens(1).toString(), 'amountGet is correct')
            order.tokenGive.should.equal(ETHER_ADDRESS, 'tokenGive is correct')
            order.amountGive.toString().should.equal(ether(1).toString(), 'amountGive is correct')
            order.timestamp.toString().length.should.be.at.least(1, 'timestamp is present')
        })

        it('emits an "Order" event', async () => {
            const log = result.logs[0]
            log.event.should.eq('Order')
            const event = log.args

            event.id.toString().should.equal('1', 'id is correct')
            event.user.should.equal(user1, 'user is correct')
            event.tokenGet.should.equal(token.address, 'tokenGet is corect')
            event.amountGet.toString().should.equal(tokens(1).toString(), 'amountGet is correct')
            event.tokenGive.should.equal(ETHER_ADDRESS, 'tokenGive is correct')
            event.amountGive.toString().should.equal(ether(1).toString(), 'amountGive is correct')
            event.timestamp.toString().length.should.be.at.least(1, 'timestamp is present')
        })
    })

    describe('order actions', async () => {
        beforeEach(async () => {
            // user1 deposits Ether
            await exchange.depositEther({ from: user1, value: ether(1) })

            // Give tokens to user2
            await token.transfer(user2, tokens(100), { from: deployer })

            // user2 deposits tokens only
            await token.approve(exchange.address, tokens(2), { from: user2 })
            await exchange.depositToken(token.address, tokens(2), { from: user2 })

            // Make an order
            await exchange.makeOrder(token.address, tokens(1), ETHER_ADDRESS, ether(1), { from: user1 })
        })

        describe('filling orders', async () => {
            let result

            describe('success', async () => {
                beforeEach(async () => {
                    // user2 fills order
                    result = await exchange.fillOrder('1', { from: user2 })
                })

                it('executes the trade and charge fees', async () => {
                    let balance

                    balance = await exchange.balanceOf(token.address, user1)
                    balance.toString().should.equal(tokens(1).toString(), 'user1 recieved tokens')

                    balance = await exchange.balanceOf(ETHER_ADDRESS, user2)
                    balance.toString().should.equal(ether(1).toString(), 'user2 recieved ether')

                    balance = await exchange.balanceOf(ETHER_ADDRESS, user1)
                    balance.toString().should.equal('0', 'user1 Ether deducted')

                    balance = await exchange.balanceOf(token.address, user2)
                    balance.toString().should.equal(tokens(0.9).toString(), 'user2 tokens deducted with fees applied')

                    const feeAccount = await exchange.feeAccount()
                    balance = await exchange.balanceOf(token.address, feeAccount)
                    balance.toString().should.equal(tokens(0.1).toString(), 'feeAccount recieved fee')
                })

                it('updates filled orders', async () => {
                    const orderFilled = await exchange.orderFilled(1)
                    orderFilled.should.equal(true)
                })

                it('emits an "Trade" event', async () => {
                    const log = result.logs[0]
                    log.event.should.eq('Trade')
                    const event = log.args

                    event.id.toString().should.equal('1', 'id is correct')
                    event.user.should.equal(user1, 'user is correct')
                    event.tokenGet.should.equal(token.address, 'tokenGet is corect')
                    event.amountGet.toString().should.equal(tokens(1).toString(), 'amountGet is correct')
                    event.tokenGive.should.equal(ETHER_ADDRESS, 'tokenGive is correct')
                    event.amountGive.toString().should.equal(ether(1).toString(), 'amountGive is correct')
                    event.userFill.should.equal(user2, 'userFill is correct')
                    event.timestamp.toString().length.should.be.at.least(1, 'timestamp is present')
                })
            })

            describe('failure', async () => {
                it('rejects invalid order ids', async () => {
                    const invalidOrderId = 99999
                    await exchange.fillOrder(invalidOrderId, { from: user2 }).should.be.rejected
                })

                it('rejects already filled orders', async () => {
                    await exchange.fillOrder('1', { from: user2 }).should.be.fulfilled
                    await exchange.fillOrder('1', { from: user2 }).should.be.rejected
                })

                it('rejects canceled orders', async () => {
                    await exchange.cancelOrder('1', { from: user1 }).should.be.fulfilled
                    await exchange.fillOrder('1', { from: user2 }).should.be.rejected
                })
            })
        })

        describe('cancelling orders', async () => {
            let result

            describe('success', async () => {
                beforeEach(async () => {
                    result = await exchange.cancelOrder('1', { from: user1 })
                })

                it('updates canceled orders', async () => {
                    const orderCancelled = await exchange.orderCancelled(1)
                    orderCancelled.should.equal(true)
                })

                it('emits an "Cancel" event', async () => {
                    const log = result.logs[0]
                    log.event.should.eq('Cancel')
                    const event = log.args

                    event.id.toString().should.equal('1', 'id is correct')
                    event.user.should.equal(user1, 'user is correct')
                    event.tokenGet.should.equal(token.address, 'tokenGet is corect')
                    event.amountGet.toString().should.equal(tokens(1).toString(), 'amountGet is correct')
                    event.tokenGive.should.equal(ETHER_ADDRESS, 'tokenGive is correct')
                    event.amountGive.toString().should.equal(ether(1).toString(), 'amountGive is correct')
                    event.timestamp.toString().length.should.be.at.least(1, 'timestamp is present')
                })
            })

            describe('failure', async () => {
                it('rejects invalid order ids', async () => {
                    const invalidOrderId = 99999
                    await exchange.cancelOrder(invalidOrderId, { from: user1 }).should.be.rejected
                })

                it('rejects unauthorized cancelations', async () => {
                    await exchange.cancelOrder('1', { from: user2 }).should.be.rejected
                })
            })
        })
    })

})