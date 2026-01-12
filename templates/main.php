<?php
use OCP\Util;
Util::addStyle('domus', 'style');
Util::addScript('domus', '3rdParty/chart.umd');
Util::addScript('domus', 'domusCoreBundle');
Util::addScript('domus', 'domusAccounts');
Util::addScript('domus', 'domusDistributions');
Util::addScript('domus', 'domusTasks');
Util::addScript('domus', 'domusDashboard');
Util::addScript('domus', 'domusAnalytics');
Util::addScript('domus', 'domusProperties');
Util::addScript('domus', 'domusUnits');
Util::addScript('domus', 'domusPartners');
Util::addScript('domus', 'domusTenancies');
Util::addScript('domus', 'domusBookings');
Util::addScript('domus', 'domusSettings');
Util::addScript('domus', 'domusDocuments');
?>
<div id="app-navigation"></div>
<?php $accountsJson = htmlspecialchars(json_encode($accounts ?? [], JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_AMP | JSON_HEX_QUOT), ENT_QUOTES, 'UTF-8'); ?>
<div id="app-content" data-accounts="<?php echo $accountsJson; ?>">
    <div id="domus-content" class="domus-content"></div>
</div>
<div id="app-sidebar"></div>
