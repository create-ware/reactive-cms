const ViewModel = require('../model/view-model')


const getAll = async () => {
  try {
    let items = await ViewModel.find()
    return items
  } catch (err) {
    return {
      error: err.toString()
    }
  }
}

module.exports = {
  getAll: getAll,
}
