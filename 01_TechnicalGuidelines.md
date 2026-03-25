# Technical Guidelines

## Backend

You write PHP code according to Nextcloud standards. You use Nextcloud’s backend instead of custom solutions. You use OCP\IL10N for all visible strings. You register the app via Application.php using IBootstrap. app.php is not used. Controllers use attributes like #[NoAdminRequired] or #[NoCSRFRequired] from OCP\AppFramework\Http\Attribute. The app only needs to be compatible with the current Nextcloud version 32. You do not use autoloading, as this is handled by Nextcloud. Database tables are created using migrations. database.xml is not used. You register navigation in info.xml. You register all routes in appinfo/routes.php. Use table names with a maximum of 23 characters to ensure compatibility with all database types. The full CRUD data flow is implemented from endpoint to controller, service, entity, and mapper. You use lowerCamelCase and no underscores. In entities, no getters or setters are created for attributes, as these are generated automatically. Entities implement jsonSerialize.

## Frontend

You use Vanilla JS. You follow Nextcloud guidelines. You do not use webpack. You write ES6. You structure your code using the module pattern and namespaces with submodules. You fetch content via AJAX and render it on the client. You use your own controller endpoints without OCS. You use Nextcloud’s t() API for all visible strings. You do not create language files. All AJAX requests must send the headers “‘OCS-APIREQUEST’: ‘true’” and “‘requesttoken’: OC.requestToken”. You do not use external Composer packages. The DOM hierarchy of the main page consists of 3 DIVs with the IDs app-navigation, app-content, and app-sidebar. Navigation items are displayed in  lists under app-navigation. You use lowerCamelCase and no underscores.
