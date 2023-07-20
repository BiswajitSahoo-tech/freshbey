const asyncHandler = require('express-async-handler')
const Order = require('../models/orderModel')
const Product = require('../models/productModel')
const productController = require('./../controllers/productController')

// @desc    Create new order
// @route   POST /api/orders
// @access  Private
const addOrderItems = asyncHandler(async (req, res) => {
  const {
    orderItems,
    shippingAddress,
    paymentMethod,
    itemsPrice,
    shippingPrice,
    totalPrice,
  } = req.body
  // Product price validation
  orderItems.forEach(async (item) => {
    let lookupItem = await Product.findById(item.product)
    if (parseFloat(item.price) !== lookupItem.price) {
      res.status(400)
      throw new Error(
        'There is a discrepancy between the prices of the items, and whats in the Database, please try again!',
      )
    }
  })

  if (orderItems && orderItems.length === 0) {
    res.status(400)
    throw new Error('No order items')
  } else {
    const order = new Order({
      orderItems,
      user: req.user._id,
      shippingAddress,
      paymentMethod,
      itemsPrice,
      shippingPrice,
      totalPrice,
    })

    const createdOrder = await order.save()

    res.status(201).json(createdOrder)
  }
})

// @desc    Get order by ID
// @route   GET /api/orders/:id
// @access  Private
const getOrderById = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id).populate(
    'user',
    'name email',
  )

  if (order && (req.user.isAdmin || order.user._id.equals(req.user._id))) {
    res.json(order)
  } else {
    res.status(404)
    throw new Error('Order not found')
  }
})

// @desc    Update order to paid
// @route   GET /api/orders/:id/pay
// @access  Private
// const updateOrderToPaid = asyncHandler(async (req, res) => {
//   const order = await Order.findById(req.params.id)

//   if (order) {
//     order.isPaid = true
//     order.paidAt = Date.now()
//     order.paymentResult = {
//       id: req.body.id,
//       status: req.body.status,
//       update_time: req.body.update_time,
//       email_address: req.body.payer.email_address,
//     }

//     const updatedOrder = await order.save()

//     res.json(updatedOrder)
//   } else {
//     res.status(404)
//     throw new Error('Order not found')
//   }
// })
async function rollback(req, res, itemUpdateLog){
  const rollbackPromises = itemUpdateLog.map( async (item)=> {
    await productController.updateStockCount(
      req,
      res,
      item.product,
      -1*parseInt(item.qty),
    )
  })

  try {
    await Promise.all( rollbackPromises )
  } catch (error) {
    console.log('error while rollbacking')
    // throw error
  }
}
const updateOrderToPaid = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id)
  //creating a new empty log for this transaction, would follow a immidiate modification approach.
  let itemUpdateLog = []
  let error = undefined
  if (order) {
    //below .map() function return an array of promises
    const updatePromises = order.orderItems.map(async (item) => {
      try{
        // console.log(item.qty)
        await productController.updateStockCount(
          req,
          res,
          item.product,
          parseInt(item.qty),
        )
        // console.log(item.qty)
        itemUpdateLog.push(
                          {
                            product: item.product, 
                            qty:item.qty
                          }
                          );
      }catch( err){
        error = err;
        
      }
      
    })
    //below function to resolve the array of promises
    try {
      await Promise.all(updatePromises)
      console.log(itemUpdateLog)
      if(error !== undefined){
        //here we perform a rollback
        rollback(req, res, itemUpdateLog)
        throw error
      }
        
    } catch (error) {
      return res.status(404).json({
        status: 'fail',
        message: error.message,
      })
    }

    order.isPaid = true
    order.paidAt = Date.now()
    
    const updatedOrder = await order.save()
    await updatedOrder.populate(
      'user',
      'name email',
    )
    res.json(updatedOrder)
  } else {
    res.status(404)
    throw new Error('Order not found')
  }
})

// @desc    Get logged in user orders
// @route   GET /api/orders/myorders
// @access  Private
const getMyOrders = asyncHandler(async (req, res) => {
  const orders = await Order.find({ user: req.user._id })
  res.json(orders)
})

// @desc    Get all orders
// @route   GET /api/orders
// @access  Private/Admin
const getOrders = asyncHandler(async (req, res) => {
  const orders = await Order.find({}).populate('user', 'id name')
  res.json(orders)
})

// @desc    Update order to delivered
// @route   GET /api/orders/:id/deliver
// @access  Private/Admin
const updateOrderToDelivered = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id)

  if (order) {
    order.isDelivered = true
    order.deliveredAt = Date.now()

    const updatedOrder = await order.save()
    await updatedOrder.populate(
      'user',
      'name email',
    )
    res.json(updatedOrder)
  } else {
    res.status(404)
    throw new Error('Order not found')
  }
})

module.exports = {
  addOrderItems,
  getOrderById,
  updateOrderToPaid,
  getMyOrders,
  getOrders,
  updateOrderToDelivered,
}
