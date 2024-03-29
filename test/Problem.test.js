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

        describe('depositing tokens', () => {
            let result
            let amount = tokens(10)
    
            describe('success', () => {
                beforeEach(async () => {
                    await token.approve(exchange.address, amount, { from: user1 })
                    result = await exchange.depositToken(token.address, amount, { from: user1 })
                })
    
                it('tracks the token deposit', async () => {
                    // Check exchange token balance
                    let balance
                    balance = await token.balanceOf(exchange.address)
                    balance.toString().should.equal(amount.toString())
                    // Check tokens on exchange
                    balance = await exchange.tokens(token.address, user1)
                    balance.toString().should.equal(amount.toString())
                })
    
                it('emits a deposit event', async () => {
                    const log = result.logs[0]
                    log.event.should.eq('Deposit')
    
                    const event = log.args
    
                    event.token.should.equal(token.address, 'token address is correct')
                    event.user.should.equal(user1, 'user address is correct')
                    event.amount.toString().should.equal(amount.toString(), 'amount is correct')
                    event.balance.toString().should.equal(amount.toString(), 'balance is correct')
                })
            })
    
            describe('failure', () => {
                it('rejects Ether deposits', async () => {
                    await exchange.depositToken(ETHER_ADDRESS, tokens(10), { from: user1 }).should.be.rejected
                })
    
                it('fails when no tokens are approved', async () => {
                    // Don't approve any tokens before depositing
                    await exchange.depositToken(token.address, tokens(10), { from: user1 }).should.be.rejected
                })
            })
    
        })
    
        describe('withdrawing tokens', async () => {
            let amount
            let result
    
            describe('success', async () => {
                beforeEach(async () => {
                    amount = tokens(10)
    
                    // Deposit tokens before withdrawing
                    await token.approve(exchange.address, amount, { from: user1 })
                    await exchange.depositToken(token.address, amount, { from: user1 })
    
                    // Now withdraw tokens
                    result = await exchange.withdrawToken(token.address, amount, { from: user1 })
                })
    
                it('withdraws token funds', async () => {
                    const balance = await exchange.tokens(token.address, user1)
                    balance.toString().should.equal('0')
                })
    
                it('emits a "Withdraw" event', async () => {
                    const log = result.logs[0]
                    log.event.should.equal('Withdraw')
    
                    const event = log.args
    
                    event.token.should.equal(token.address)
                    event.user.should.equal(user1)
                    event.amount.toString().should.equal(amount.toString())
                    event.balance.toString().should.equal('0')
                })
            })
    
            describe('failure', async () => {
                it('rejects Ether withdraws', async () => {
                    await exchange.withdrawToken(ETHER_ADDRESS, tokens(10), { from: user1 }).should.be.rejected
                })
    
                it('fails for insufficient balances', async () => {
                    await exchange.withdrawToken(token.address, tokens(10), { from: user1 }).should.be.rejected
                })
            })
        })
    })

})