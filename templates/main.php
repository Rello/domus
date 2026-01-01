<?php
use OCP\Util;
Util::addStyle('domus', 'style');
Util::addScript('domus', '3rdParty/chart.umd');
Util::addScript('domus', 'app');
?>
<div id="app-navigation"></div>
<?php $accountsJson = htmlspecialchars(json_encode($accounts ?? [], JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_AMP | JSON_HEX_QUOT), ENT_QUOTES, 'UTF-8'); ?>
<div id="app-content" data-accounts="<?php echo $accountsJson; ?>"></div>
<div id="app-sidebar"></div>
