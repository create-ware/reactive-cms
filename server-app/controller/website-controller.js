const dateTime = require('node-datetime')
const mongoose = require('mongoose')

const DASHBOARD_ADMIN_CONFIG = require('../config/dashboard-admin-config')
const SITE_CONFIG = require('../config/site-config')
const VIEW_FUNCTIONS = require('../lib/view-functions')
const VIEWS = require('../config/views')
const session = require('../lib/session')

const userQuery = require('../query/user-query')
const postQuery = require('../query/post-query')
const pageQuery = require('../query/page-query')
const settingQuery = require('../query/setting-query')
const siteQuery = require('../query/site-query')
const viewQuery = require('../query/view-query')
const resourceQuery = require('../query/resource-query')
const roleQuery = require('../query/role-query')


exports.websiteSetupView = async (req, res) => {
  let totalUsers = await userQuery.getTotalItems()
  if (totalUsers.error) {
    res.view('setup', {
      viewFunctions: VIEW_FUNCTIONS,
      title: 'SETUP',
      error_message: 'Error',
    })
    return
  }
  if (totalUsers) {
    DASHBOARD_ADMIN_CONFIG.setupPassed = true
    return res.redirect('/admin')
  }
  DASHBOARD_ADMIN_CONFIG.setupPassed = false
  res.view('setup', {
    viewFunctions: VIEW_FUNCTIONS,
    title: 'SETUP',
    error_message: '',
  })
}

exports.websiteSetupPassed = async (req, res, next) => {
  if (!DASHBOARD_ADMIN_CONFIG.setupPassed)
    return res.redirect('/setup')
}

exports.websiteSetupSetInitialConfig = async (req, res) => {
  let setup_site_name = req.body.setup_site_name
  let setup_site_url = req.body.setup_site_url
  let setup_first_name = req.body.setup_first_name
  let setup_user_email = req.body.setup_user_email
  let setup_user_name = req.body.setup_user_name
  let setup_user_pass = req.body.setup_user_pass
  if (!setup_site_name && !setup_site_url && !setup_first_name && !setup_user_name && !setup_user_pass) {
    res.view('setup', {
      title: 'SETUP',
      error_message: 'Complete the request data',
    })
  } else {
    let userData = {}
    let settingsData = {}
    let siteData = {}
    let totalUsers = await userQuery.getTotalItems()
    if (totalUsers)
      return res.redirect('admin')

    let viewsSaved = await viewQuery.createMany(VIEWS)
    let adminRoleData = {}
    adminRoleData.role_name = 'administrator'
    adminRoleData.role_user_ref = '000000000000000000000000'
    let adminRole = await roleQuery.create(adminRoleData)
    let resources = []
    for (let view of viewsSaved) {
      resources.push({
        resource_name: view.view_name,
        resource_permission: ['c', 'r', 'u', 'd', 'v'],
        resource_role_ref: adminRole._id,
      })
    }
    await resourceQuery.createMany(resources)
    let userPassword = await session.hashPassword(setup_user_pass)
    userData.user_name = setup_user_name
    userData.user_pass = userPassword
    userData.user_email = setup_user_email
    userData.user_first_name = setup_first_name
    userData.user_registration_date = dateTime.create().format('Y-m-d H:M:S')
    userData.user_active = true
    userData.user_role_ref = adminRole
    settingsData.setting_page_title = DASHBOARD_ADMIN_CONFIG.dashboardTitle
    settingsData.setting_items_peer_page = DASHBOARD_ADMIN_CONFIG.MAX_PAGES_BY_REQUEST
    siteData.site_name = setup_site_name
    siteData.site_items_peer_page = SITE_CONFIG.siteItemsPeerPage
    siteData.site_url = setup_site_url
    await userQuery.create(userData)
    await settingQuery.create(settingsData)
    await siteQuery.create(siteData)
    if (userQuery.error || settingQuery.error || siteQuery.error) {
      // NOTE: drop collections
      res.view('setup', {
        title: 'SETUP',
        error_message: userQuery.error.toString(),
      })
      return
    }
    DASHBOARD_ADMIN_CONFIG.setupPasse = true
    res.redirect('admin')
  }
}

exports.websiteAdminValidateRequestAccess = async (req, res) => {
  let totalUsers = await userQuery.getTotalItems()
  if (!totalUsers)
    return res.redirect('setup')

  if (req.session.user && req.session.user.user_role)
    res.redirect('dashboard')
  else
    res.view('dashboard-website-login', {
      title: DASHBOARD_ADMIN_CONFIG.dashboardTitle,
      error_message: '',
    })
}

exports.websiteAdminValidateLoginAccess = async (req, res) => {
  let totalUsers = await userQuery.getTotalItems()
  if (!totalUsers)
    return res.redirect('setup')

  const user_name = req.body.user_name
  const user_pass = req.body.user_pass
  let roles = await roleQuery.getAll()
  let user = await userQuery.getByUserName(user_name)
  if (!user) {
    res.view('dashboard-website-login', {
      viewFunctions: VIEW_FUNCTIONS,
      title: DASHBOARD_ADMIN_CONFIG.dashboardTitle,
      error_message: 'Not valid user',
    })
    return
  }
  let result = await session.passwordIsEqual(user_pass, user.user_pass)
  if (!result) {
    res.view('dashboard-website-login', {
      title: DASHBOARD_ADMIN_CONFIG.dashboardTitle,
      error_message: 'No valid user',
    })
    return
  }
  let roleExists = false
  for (let role of roles)
    if (role._id.toString() === user.user_role_ref.toString())
      roleExists = true
  if (!roleExists) {
    res.view('dashboard-website-login', {
      title: DASHBOARD_ADMIN_CONFIG.dashboardTitle,
      error_message: 'No valid user',
    })
    return
  }
  req.session.user = {
    user_id: user._id.toString(),
    user_name: user.user_name,
    user_email: user.user_email,
    user_pass: user.user_pass,
    user_role: user.user_role,
    user_resource: user.user_resource,
    user_role_ref: user.user_role_ref,
  }
  res.redirect('dashboard')
}

exports.websiteDashboardLogout = async (req, res) => {
  if (req.session && req.session.user) {
    let userID = req.session.user.user_id
    req.sessionStore.destroy(req.session.sessionId)
    await session.removeUserSessionOnDB(userID)
    req.session = null
  }
  res.redirect('admin')
}

exports.websiteDashboardView = async (req, res) => {
  let userID = req.session.user.user_id
  let user = await userQuery.getByID(userID)
  res.view('dashboard-website-index', {
    viewFunctions: VIEW_FUNCTIONS,
    title: DASHBOARD_ADMIN_CONFIG.dashboardTitle,
    user_id: req.session.user.user_id,
    user_data: JSON.stringify(user),
  })
}

exports.websiteIndexView = async (req, res) => {
  let page = null
  let pageView = 'default/index'
  let templateHomeID = SITE_CONFIG.siteTemplateHome
  if (templateHomeID) {
    page = await pageQuery.getByID(templateHomeID)
    if (page.error) {
      res.code(500).send({
        status_code: 1,
        status_msg: 'Page Not Found',
      })
      return
    }
    if (page.page_template)
      pageView = 'template/' + page.page_template
  }
  res.view(pageView, {
    viewFunctions: VIEW_FUNCTIONS,
    title: SITE_CONFIG.siteTitle,
    page: page,
  })
}

exports.websitePageView = async (req, res) => {
  let pageSlug = req.params.slug
  let pageView = 'default/page-detail'
  let page = await pageQuery.getBySlug(pageSlug)
  if (!page) {
    const urlData = req.urlData()
    res.code(404).view('404', {
      title: SITE_CONFIG.siteTitle,
      status: 'Page not found',
      error_message: 'Route: ' + urlData.path + ' Not found.',
    })
    return
  }
  if (page.error) {
    let statusCode = page.error.statusCode >= 400 ? page.error.statusCode : 500
    res.code(statusCode).view('500', {
      title: SITE_CONFIG.siteTitle,
      status: 'Server error!',
      error_message: statusCode >= 500 ? 'Internal server error' : page.error.message,
    })
  }
  if (page.page_template)
    pageView = 'template/' + page.page_template
  res.view(pageView, {
    viewFunctions: VIEW_FUNCTIONS,
    title: SITE_CONFIG.siteTitle,
    page: page,
  })
}

exports.websiteBlogArchiveView = async (req, res) => {
  res.redirect('/blog/page/1')
}

exports.websiteBlogArchivePaginatedView = async (req, res) => {
  let currentPage = req.params.page
  let skipItems = SITE_CONFIG.siteItemsPeerPage * (currentPage - 1)
  let totalItems = await postQuery.getTotalItems()
  let ascSort = -1
  let items = await postQuery.getItemsByPage({
    skip: skipItems,
    limit: SITE_CONFIG.siteItemsPeerPage,
    sort: { 'post_date': ascSort },
  })
  if (items.error) {
    let statusCode = items.error.statusCode >= 400 ? items.error.statusCode : 500
    res.code(statusCode).view('500', {
      title: SITE_CONFIG.siteTitle,
      status: 'Server error!',
      error_message: statusCode >= 500 ? 'Internal server error' : items.error.message,
    })
    return
  }
  let view = 'default/post-list'
  if (SITE_CONFIG.siteTemplatePosts)
    view = 'template/' + SITE_CONFIG.siteTemplatePosts
  res.view(view, {
    viewFunctions: VIEW_FUNCTIONS,
    title: SITE_CONFIG.siteTitle,
    items: items,
    total_pages: Math.ceil(totalItems / SITE_CONFIG.siteItemsPeerPage),
    items_skipped: skipItems,
    total_items: totalItems,
    current_page: currentPage,
    items_peer_page: SITE_CONFIG.siteItemsPeerPage,
    pagination_items: 2,
  })
}

exports.websiteBlogSingleView = async (req, res) => {
  let postSlug = req.params.slug
  let post = await postQuery.getBySlug(postSlug)
  if (!post) {
    const urlData = req.urlData()
    res.code(404).view('404', {
      title: SITE_CONFIG.siteTitle,
      status: 'Page not found',
      error_message: 'Route: ' + urlData.path + ' Not found.',
    })
    return
  }
  if (post.error) {
    let statusCode = post.error.statusCode >= 400 ? post.error.statusCode : 500
    res.code(statusCode).view('500', {
      title: SITE_CONFIG.siteTitle,
      status: 'Server error!',
      error_message: statusCode >= 500 ? 'Internal server error' : post.error.message,
    })
    return
  }
  res.view('default/post-detail', {
    viewFunctions: VIEW_FUNCTIONS,
    title: SITE_CONFIG.siteTitle,
    post: post,
  })
}
