const AdminJSImport = require('adminjs');
const AdminJS = AdminJSImport.default || AdminJSImport;

// Funkcija adminMiddleware skrbi za pomemben del logike aplikacije.
function adminMiddleware(req, res, next) {
  if (req.session.user?.role === 'admin') {
    next();
  } else {
    res.status(403).send('Dostop dovoljen samo za admin uporabnika.');
  }
}

async function setupAdmin(app, authMiddleware, models) {
  const AdminJSMongooseModule = await import('@adminjs/mongoose');
  const AdminJSMongoose = AdminJSMongooseModule.default || AdminJSMongooseModule;
  const { Database, Resource } = AdminJSMongoose;
  AdminJS.registerAdapter({ Database, Resource });

  const AdminJSExpressModule = await import('@adminjs/express');
  const AdminJSExpress = AdminJSExpressModule.default || AdminJSExpressModule;
  const { User, Message, Order, Rating, Product, Wishlist } = models;

  const adminJs = new AdminJS({
    rootPath: '/admin',
    resources: [
      { resource: User, options: { navigation: 'Uporabniki' } },
      { resource: Message, options: { navigation: 'Klepet' } },
      { resource: Order, options: { navigation: 'Trgovina' } },
      {
        resource: Product,
        options: {
          navigation: 'Trgovina',
          actions: {
            uploadImage: {
              actionType: 'resource',
              label: 'Upload slik',
              icon: 'Upload',
              handler: async () => ({
                redirectUrl: '/admin/upload'
              })
            }
          },
          properties: {
            category: {
              availableValues: [
                { value: 'Cevlji', label: 'Cevlji' }
              ]
            },
            subcategory: {
              availableValues: [
                { value: 'Nike', label: 'Nike' },
                { value: 'Adidas', label: 'Adidas' },
                { value: 'Jordan', label: 'Jordan' },
                { value: 'Asics', label: 'Asics' }
              ]
            }
          }
        }
      },
      { resource: Wishlist, options: { navigation: 'Uporabniki' } },
      { resource: Rating, options: { navigation: 'Ocene' } }
    ],
    branding: {
      companyName: 'Domen Core Admin'
    }
  });

  const adminRouter = AdminJSExpress.buildRouter(adminJs);
  app.use(adminJs.options.rootPath, authMiddleware, adminMiddleware, adminRouter);
}

module.exports = setupAdmin;


