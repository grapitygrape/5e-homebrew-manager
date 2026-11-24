<!--
  SetupDeployStep — Step 4: site and homebrew deployment target folders.
-->
<script lang="ts">
  import StatusText from '$lib/ui/StatusText.svelte';
  import FolderList from '$lib/components/FolderList.svelte';
  import { siteHomebrewFolders } from '$lib/data';
  import type { SetupDraft } from '$lib/api';
  import type { SetupPage } from '$lib/state/setup-page.svelte.ts';

  interface Props {
    page: SetupPage;
    draft: SetupDraft;
  }

  let { page, draft }: Props = $props();
</script>

<h3 class="setup-subhead">Deploy site to</h3>
<p class="setup-intro">
  This app serves a copy of the site for local testing. You can choose
  additional deployment folders below, such as for hosting other copies on your
  local network.
</p>
<FolderList
  bind:values={draft.siteDeployFolders}
  name="siteDeployFolders"
  label="Site deploy folder"
  desktop={page.nativeDialogs}
/>

<h3 class="setup-subhead">Deploy homebrew files to</h3>
<p class="setup-intro">
  This copies off the working homebrew folder on deploy, for adding to your
  Foundry's Data folder, saving off another copy to upload elsewhere, or the
  deploy above. If you entered a full site deploy above one folder will be
  created here for you.
</p>
<FolderList
  bind:values={draft.homebrewDeployFolders}
  name="homebrewDeployFolders"
  label="Homebrew deploy folder"
  desktop={page.nativeDialogs}
  locked={siteHomebrewFolders(draft.siteDeployFolders)}
  lockedTitle="Created from a site deploy folder above"
/>

{#if page.finishError}
  <StatusText as="p" variant="error">{page.finishError}</StatusText>
{/if}

<style>
  .setup-subhead {
    margin-block: var(--space-5) var(--space-2);
    font-size: var(--text-sm);
  }
</style>
