/* Bounded managed-store primitive. No overwrite fallback is permitted. */
#define _GNU_SOURCE
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <errno.h>
#include <fcntl.h>
#include <unistd.h>
#include <sys/stat.h>
#ifdef __linux__
#include <sys/syscall.h>
#include <linux/fs.h>
#endif
static void die(const char *stage) { fprintf(stderr, "%s: %s (%d)\n", stage, strerror(errno), errno); exit(1); }
static int parent(int root, const char *input, char **leaf) {
  if (!*input || *input == '/' || strchr(input, '\\')) { errno=EINVAL; die("relative path"); }
  char *s=strdup(input), *save=NULL, *part=strtok_r(s,"/",&save); int fd=dup(root);
  while(part) {
    if (!strcmp(part,".") || !strcmp(part,"..")) { errno=EINVAL; die("path component"); }
    char *next=strtok_r(NULL,"/",&save);
    if(!next) { *leaf=strdup(part); free(s); return fd; }
    int child=openat(fd,part,O_RDONLY|O_DIRECTORY|O_NOFOLLOW); if(child<0)die("open parent"); close(fd);fd=child;part=next;
  }
  errno=EINVAL;die("empty path");return -1;
}
int main(int argc,char **argv) {
  if(argc!=4)return 2;
  int root=open(argv[1],O_RDONLY|O_DIRECTORY|O_NOFOLLOW);if(root<0)die("root");
  char *from,*to; int a=parent(root,argv[2],&from),b=parent(root,argv[3],&to);
  struct stat source,dest;
  if(fstatat(a,from,&source,AT_SYMLINK_NOFOLLOW)<0)die("source");
  if(S_ISLNK(source.st_mode)||(!S_ISREG(source.st_mode)&&!S_ISDIR(source.st_mode))){errno=EINVAL;die("source type");}
  if(fstat(b,&dest)<0)die("destination parent");
  if(source.st_dev!=dest.st_dev){errno=EXDEV;die("cross filesystem");}
#ifdef __APPLE__
  if(renameatx_np(a,from,b,to,RENAME_EXCL)<0)die("exclusive rename");
#elif defined(__linux__)
  if(syscall(SYS_renameat2,a,from,b,to,RENAME_NOREPLACE)<0)die("exclusive rename");
#else
  errno=ENOTSUP;die("unsupported host");
#endif
  if(fsync(a)<0||fsync(b)<0)die("sync parent");
  close(a);close(b);close(root);free(from);free(to);return 0;
}
